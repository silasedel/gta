// Southline — procedural tropical coastal city (CITY agent)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { rng, bandFacade, finSignTexture, shopFacade, officeFacade, decoFacade, glassFacade, trunkTexture, frondTexture, adsTexture, ADS, radialTexture, helipadTexture, loadPBR } from './city/tex.js';
import { Batch, rectPts, roundRectPts, wallStrip, capPoly, parapet, palmGeometry, orient } from './city/geo.js';
import { sharedVegMaterials } from './vegetation/materials.js';

const RW = 14, HW = RW / 2, SW = 5, CURB = 0.15;
const XS = [-480, -380, -280, -180, -80, 20, 120, 220, 320, 420];
const ZS = [-450, -350, -250, -150, -50, 50, 150, 250, 350, 450];
const BEACH_X0 = 440;
// Empty lots reserved for walk-in stores (INTERIORS agent). w = frontage width, d = depth along `facing`.
const SHOP_LOTS = [
  { x: 463, z: -40, facing: -Math.PI / 2, zone: 'beach' },
  { x: 401, z: -20, facing: Math.PI / 2, zone: 'deco' },
  { x: 401, z: -100, facing: Math.PI / 2, zone: 'deco' },
  { x: 401, z: 80, facing: Math.PI / 2, zone: 'deco' },
  { x: 339, z: 10, facing: -Math.PI / 2, zone: 'deco' },
  { x: 301, z: 25, facing: Math.PI / 2, zone: 'mid' },
  { x: 170, z: 131, facing: 0, zone: 'mid' },
  { x: 1, z: -15, facing: Math.PI / 2, zone: 'downtown' },
  { x: 39, z: 15, facing: -Math.PI / 2, zone: 'downtown' },
  { x: -45, z: -69, facing: 0, zone: 'downtown' },
  { x: -115, z: 69, facing: Math.PI, zone: 'downtown' },
  { x: -299, z: -200, facing: Math.PI / 2, zone: 'residential' },
  { x: -230, z: 269, facing: Math.PI, zone: 'residential' },
  { x: -399, z: 10, facing: Math.PI / 2, zone: 'residential' },
  { x: 139, z: -300, facing: -Math.PI / 2, zone: 'commercial' },
].map((l) => { const alongX = Math.abs(Math.sin(l.facing)) > 0.5; return { ...l, w: 18, d: 14, sx: alongX ? 14 : 18, sz: alongX ? 18 : 14, y: l.zone === 'beach' ? 0 : 0.15 }; });
const lotBlocked = (x, z, m = 1) => SHOP_LOTS.some((l) => Math.abs(x - l.x) < l.sx / 2 + m && Math.abs(z - l.z) < l.sz / 2 + m);
const lotRectBlocked = (x, z, w, d) => SHOP_LOTS.some((l) => Math.abs(x - l.x) < (l.sx + w) / 2 + 0.5 && Math.abs(z - l.z) < (l.sz + d) / 2 + 0.5);
// Beach profile (shared by sand mesh + physics heightfield). Sea level y=-0.12 (environment water plane).
const AVE_NAMES = ['Sabal Ave', 'Heron Ave', 'Tarpon Ave', 'Mangrove Ave', 'Hibiscus Ave', 'Flamingo Ave', 'Pelican Ave', 'Palmetto Ave', 'Seagrape Ave', 'Southline Dr'];
const ST_NAMES = ['Southline Blvd', '2nd St', 'Marlin St', '4th St', 'Sunset St', 'Ocean St', '7th St', 'Lantana St', '9th St', 'Breeze Blvd'];
const SEA_LEVEL = -0.12;
const sandProfile = (x) => (x <= 500 ? 0 : x <= 512 ? -((x - 500) ** 2) / 576 : Math.max(-6, -0.25 - (x - 512) / 24 - Math.max(0, x - 575) * 0.03));
const WATER_LINE = 500 + Math.sqrt(-SEA_LEVEL * 576); // ~508.3 : where sand meets sea level
const PIER_Z = 120, PIER_X0 = 452, PIER_X1 = 640, PIER_Y = 1.1, PIER_HW = 5;

const PASTELS = [0xff9eb8, 0x7fe3d0, 0xffe08a, 0xbfa6ff, 0xffbf80, 0xa8eba0, 0x80d4ff, 0xff8fa8, 0xf6efe4, 0xfff3d6, 0xffb3e6, 0x9ff0e8];
const ACCENTS = [0x2ec4b6, 0xff5d8f, 0xffb703, 0x7b61ff, 0x00b4d8, 0xef476f, 0x06d6a0];
const NEONS = [0xff2bd6, 0x23f0ff, 0xff7a1a, 0x9d4dff, 0x3dff8f, 0xff3366];
const OFFICE_TINTS = [0xf2ece2, 0xe8d2b4, 0xf5c9a8, 0xcfdce6, 0xefe0c8, 0xd9c4b4, 0xfaf3e8, 0xe6b8a0, 0xc8d8c8, 0xf0d8a0, 0xd8c8e0];
const GLASS_TINTS = [0xb4d6f4, 0xa0eee4, 0xf0d0a4, 0xf0f6fa, 0xbce8cc, 0x9cc0ec, 0xdce8f4, 0xc8f0ff];

export async function createCity(game) {
  const { scene, world, RAPIER, renderer } = game;
  const R = rng(1337);
  const rr = (a, b) => a + R() * (b - a);
  const pick = (arr) => arr[(R() * arr.length) | 0];
  const root = new THREE.Group(); root.name = 'city'; scene.add(root);
  const col = new THREE.Color();

  // ---------- textures & materials ----------
  const [asph, conc, tiles, sand, grass, wood, plaster] = await Promise.all([
    loadPBR(renderer, 'asphalt_02'), loadPBR(renderer, 'concrete_floor_worn_001'), loadPBR(renderer, 'concrete_tiles_02'),
    loadPBR(renderer, 'coast_sand_01'), loadPBR(renderer, 'aerial_grass_rock'), loadPBR(renderer, 'brown_planks_03'), loadPBR(renderer, 'white_plaster_02'),
  ]);
  // CC0 models (Poly Haven / Kenney; hydrant, trash can & shrub decimated for instancing). Missing model => procedural fallback.
  const gl = new GLTFLoader();
  const loadModel = (path) => gl.loadAsync('/assets/city/models/' + path).then((g) => g.scene).catch(() => { console.warn('[city] model missing', path); return null; });
  const [mBench, mHydrant, mTrash, mFern, mShrub, mDumpster, mPot] = await Promise.all([
    loadModel('bench_wooden/painted_wooden_bench_1k.gltf'), loadModel('hydrant_lo/hydrant_lo.gltf'), loadModel('trash_can_lo/trash_can_lo.gltf'),
    loadModel('fern/fern_02_a.gltf'), loadModel('shrub_a_lo/shrub_a_lo.gltf'), loadModel('kenney_dumpster/dumpster.glb'), Promise.resolve(true)]);
  const bandTex = bandFacade(renderer, 31), shopTex = shopFacade(renderer, 21), office = officeFacade(renderer, 5), deco = decoFacade(renderer, 7), glass = glassFacade(renderer, 9);

  const pbrMat = (set, opts = {}) => new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, roughness: 1, metalness: 0, ...opts });
  const facadeMat = (f, extra = {}) => new THREE.MeshStandardMaterial({
    map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0.0,
    roughnessMap: f.rm, metalnessMap: f.rm, roughness: 1, metalness: 1, vertexColors: true, ...extra,
  });
  const M = {
    asphalt: pbrMat(asph, { color: 0x9a9a9a, normalScale: new THREE.Vector2(0.8, 0.8) }),
    roof: pbrMat(conc, { vertexColors: true }),
    slab: pbrMat(tiles, { vertexColors: true }),
    sand: pbrMat(sand, { color: 0xfff0d8 }),
    grass: pbrMat(grass, { color: 0xb8d890 }),
    wood: pbrMat(wood, { color: 0xd8b898 }),
    office: facadeMat(office),
    deco: facadeMat(deco),
    glass: facadeMat(glass, { envMapIntensity: 1.6 }),
    shop: facadeMat(shopTex),
    band: facadeMat(bandTex),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, normalMap: plaster.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.45, metalness: 0.8 }),
    markings: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x2aa6b8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 }),
  };
  for (const s of [M.office, M.deco, M.glass]) s.emissiveIntensity = 0.2;
  // window recesses / sills / mullions: reuse each facade's colour map as a bump map (dark glass reads as recessed)
  for (const [m, b] of [[M.office, 2.0], [M.deco, 1.6], [M.band, 1.6], [M.shop, 1.2]]) { m.bumpMap = m.map; m.bumpScale = b; }
  // lit windows: warm tint + per-window on/off switching over time (some flicker), driven by uniforms
  const winU = { uWinTime: { value: 0 }, uWinDensity: { value: 0.8 } };
  const winPatch = (mat, cells, warm) => {
    mat.emissive.set(warm);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWinTime = winU.uWinTime; sh.uniforms.uWinDensity = winU.uWinDensity; sh.uniforms.uWinCells = { value: new THREE.Vector2(cells[0], cells[1]) };
      sh.fragmentShader = 'uniform float uWinTime;\nuniform float uWinDensity;\nuniform vec2 uWinCells;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef USE_EMISSIVEMAP
          vec2 wCell = floor(vEmissiveMapUv * uWinCells);
          float wH = fract(sin(dot(wCell, vec2(127.1, 311.7))) * 43758.5453);
          float wSlot = floor((uWinTime + wH * 100.0) / (25.0 + wH * 70.0));
          float wS = fract(sin(dot(wCell + wSlot * 1.37, vec2(269.5, 183.3))) * 43758.5453);
          float wOn = step(wS, uWinDensity);
          float wFl = 0.55 + 0.45 * step(0.5, fract(sin(floor(uWinTime * 9.0) + wH * 91.0) * 43758.5));
          totalEmissiveRadiance *= mix(wOn, wFl, step(0.993, wH));
        #endif`);
    };
  };
  winPatch(M.office, [8, 8], 0xffdca8); winPatch(M.deco, [4, 4], 0xffd8a0); winPatch(M.band, [16, 8], 0xffe2b8); winPatch(M.glass, [16, 16], 0xfff0d8);
  M.slab.color.setScalar(2.6); M.roof.color.setScalar(2.5); M.sand.color.setRGB(1.55, 1.42, 1.22); M.wood.color.setRGB(1.3, 1.15, 1.0);

  // ---------- collider helpers ----------
  const box = (x, y, z, hx, hy, hz, rotY = 0) => {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z);
    if (rotY) d.setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) });
    world.createCollider(d);
  };
  const cyl = (x, y, z, hh, r) => world.createCollider(RAPIER.ColliderDesc.cylinder(hh, r).setTranslation(x, y, z));

  // ---------- batches ----------
  const B = { band: new Batch(), shop: new Batch(), office: new Batch(), deco: new Batch(), glass: new Batch(), roof: new Batch(), slab: new Batch(), trim: new Batch(),
    neon: new Batch(), marks: new Batch(), grass: new Batch(), lotAsphalt: new Batch(), wood: new Batch(), water: new Batch(), fin: new Batch(), sign: new Batch() };
  const inst = { ac: [], tank: [], antenna: [], beacon: [], heli: [], lamp: [], palm: Array.from({ length: 14 }, () => []), bush: [], bench: [], board: [], umbrella: [], hydrant: [], bin: [], royal: [[], [], [], []], palmetto: [[], [], []], pot: [], streetSign: [], bin2: [], bin3: [], dumpster: [], litter: [], puddle: [], fern: [], shrub: [], bLounger: [], board2: [], stool: [], bulb: [], twoWheel: [[], []], uplight: [], wallAC: [], porthole: [], patch: [], manhole: [], flower: [[], [], [], [], []], grate: [], cafe: [], bike: [], news: [], stain: [], crack: [], busStop: [], lounger: [], pierPost: [], tlMast: [], tlHead: [], tlA: [], tlB: [], pool: [] };
  const buildings = [];
  const planterPos = [];
  const graffiti = [];
  const mallSpots = [];
  const benchList = [], leanSpots = [];
  const addLean = (fx, fz, nx, nz, along, tx, tz) => { for (const u of [-0.3, 0.3]) { const x = fx + nx * 0.45 + tx * u * along, z = fz + nz * 0.45 + tz * u * along; if (!lotBlocked(x, z, 0.5)) leanSpots.push({ pos: new THREE.Vector3(x, CURB, z), heading: Math.atan2(nx, nz) }); } };
  const sidewalkSegs = [];
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
  const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(0, ry, 0)), tmpS.set(sx, sy, sz));
  const BOXG = new THREE.BoxGeometry(1, 1, 1);
  const CYLG = new THREE.CylinderGeometry(1, 1, 1, 12);
  const trimBox = (x, y, z, w, h, d, color, ry = 0) => B.trim.addGeometry(BOXG, mat4(x, y, z, ry, w, h, d), color);

  // ---------- ground ----------
  {
    const g = new THREE.PlaneGeometry(BEACH_X0 + 500, 1000, 1, 1); g.rotateX(-Math.PI / 2);
    g.translate((BEACH_X0 - 500) / 2, 0, 0);
    const uv = g.attributes.uv, P = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, P.getX(i) / 7, P.getZ(i) / 7);
    const m = new THREE.Mesh(g, M.asphalt); m.receiveShadow = true; root.add(m);
    // outer land (beyond city limits)
    const o = new THREE.PlaneGeometry(6000, 6000); o.rotateX(-Math.PI / 2); o.translate(BEACH_X0 - 3000, -0.05, 0);
    const ouv = o.attributes.uv, OP = o.attributes.position;
    for (let i = 0; i < ouv.count; i++) ouv.setXY(i, OP.getX(i) / 12, OP.getZ(i) / 12);
    const om = new THREE.Mesh(o, M.grass); om.receiveShadow = true; root.add(om);
    // physics ground: top at y=0 up to x=505, then a gentle slope into the sea
    box(-82.5, -1, 0, 522.5, 1, 700); // flat city ground: x -605..440
    { // beach + seabed: one continuous heightfield (x 440..760), no seams
      const HX0 = 440, HX1 = 760, NC = 160, NR = 1, hs = new Float32Array((NR + 1) * (NC + 1));
      for (let j = 0; j <= NC; j++) { const hx = HX0 + ((HX1 - HX0) * j) / NC; for (let i = 0; i <= NR; i++) hs[i + j * (NR + 1)] = sandProfile(hx); }
      world.createCollider(RAPIER.ColliderDesc.heightfield(NR, NC, hs, { x: HX1 - HX0, y: 1, z: 1400 }).setTranslation((HX0 + HX1) / 2, 0, 0));
    }
    // boundary walls
    box(-503, 20, 0, 3, 40, 520); box(130, 20, -503, 640, 40, 3); box(130, 20, 503, 640, 40, 3);
    box(763, 10, 0, 3, 30, 520); // far offshore limit (swimmable sea in between)
    box(600, -7.5, 0, 160, 1, 700); // safety floor under the seabed
  }

  // ---------- sand / beach ----------
  {
    const segX = 40, segZ = 60, X0 = BEACH_X0, X1 = 760, Z = 1600;
    const g = new THREE.PlaneGeometry(X1 - X0, Z * 2, segX, segZ); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, 0);
    const P = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      let y = sandProfile(x) + 0.02;
      if (x < 500 && x > 455) y += 0.04 * Math.sin(z * 0.05) * Math.sin(x * 0.2);
      P.setY(i, y); uv.setXY(i, x / 5, z / 5);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.sand); m.receiveShadow = true; root.add(m);
  }

  // ---------- district / block layout ----------
  const xb = [[-500, XS[0] - HW]], zb = [[-500, ZS[0] - HW]];
  for (let i = 0; i < XS.length - 1; i++) xb.push([XS[i] + HW, XS[i + 1] - HW]);
  xb.push([XS[XS.length - 1] + HW, BEACH_X0]);
  for (let i = 0; i < ZS.length - 1; i++) zb.push([ZS[i] + HW, ZS[i + 1] - HW]);
  zb.push([ZS[ZS.length - 1] + HW, 500]);
  const roadAtX = (x) => XS.some((v) => Math.abs(v - x) < HW + 0.5), roadAtZ = (z) => ZS.some((v) => Math.abs(v - z) < HW + 0.5);

  function district(cx, cz, w, d) {
    if (cx > 425) return 'promenade';
    if (w < 20) return 'edge';
    if (cx > 330) return 'deco';
    if (Math.abs(cx + 130) < 5 && Math.abs(cz) < 5) return 'park';
    if (Math.abs(cx - 70) < 5 && Math.abs(cz - 100) < 5) return 'plaza';
    if (Math.abs(cx - 170) < 5 && Math.abs(cz + 200) < 5) return 'park';
    const r = Math.hypot(cx + 30, cz);
    if (r < 195) return R() < 0.08 ? 'plaza' : 'tower';
    if (cx > 230) return R() < 0.1 ? 'parking' : 'decomid';
    if (r < 300) return R() < 0.1 ? 'parking' : 'mid';
    const k = R();
    return k < 0.1 ? 'park' : k < 0.17 ? 'parking' : 'low';
  }

  // ---------- building construction ----------
  function addBuilding({ cx, cz, w, d, h, style, color, rounded = 0, y0 = CURB, collider = true, roofDetails = true, front = null, pitched = false }) {
    const pts = rounded ? roundRectPts(cx, cz, w, d, rounded, 4) : rectPts(cx, cz, w, d);
    if (lotRectBlocked(cx, cz, w, d)) return pts;
    const f = style === 'glass' ? glass : style === 'deco' ? deco : style === 'band' ? bandTex : office;
    const bays = style === 'glass' || style === 'band' ? 16 : style === 'deco' ? 4 : 8;
    const floors = style === 'glass' ? 16 : style === 'deco' ? 4 : 8;
    const uOff = ((R() * bays) | 0) / bays, vOff = ((R() * floors) | 0) / floors;
    col.set(color);
    const GF = 4.2;
    if (y0 <= CURB + 0.01 && h > (style === 'deco' ? 9.5 : GF + 2) && (style !== 'glass' || R() < 0.5)) {
      wallStrip(B.shop, pts, y0, GF, 64, GF - y0, new THREE.Color(0xffffff), ((R() * 8) | 0) / 8, -y0 / (GF - y0));
      const ex = rounded ? roundRectPts(cx, cz, w + 0.3, d + 0.3, rounded + 0.15, 4) : rectPts(cx, cz, w + 0.3, d + 0.3);
      wallStrip(B.trim, ex, GF, GF + 0.3, 10, 10, new THREE.Color(0xf4f0e8));
      capPoly(B.trim, ex, GF + 0.3, new THREE.Color(0xf4f0e8));
      wallStrip(B[style], pts, GF, h, f.tileW, f.tileH, col, uOff, vOff - GF / f.tileH);
      if (!rounded && R() < 0.7) { // 3D storefront awnings, one per ~8m shop bay
        const awc = new THREE.Color(pick([0xe85d3f, 0x16a3b8, 0xffcc33, 0x1f8f55, 0xff9ec4, 0xe63946, 0x264b96, 0x2ec4b6]));
        for (const [fxn, fzn] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const L = Math.abs(fxn) ? d : w, n2 = Math.floor((L - 1) / 8); if (n2 < 1) continue;
          const ryA = Math.atan2(fxn, fzn), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.38, ryA, 0, 'YXZ'));
          for (let k = 0; k < n2; k++) {
            const u = -L / 2 + (L - n2 * 8) / 2 + 4 + k * 8;
            const ax = cx + fxn * (w / 2 + 0.75) + Math.abs(fzn) * u, az = cz + fzn * (d / 2 + 0.75) + Math.abs(fxn) * u;
            B.trim.addGeometry(BOXG, new THREE.Matrix4().compose(new THREE.Vector3(ax, 3.55, az), q, new THREE.Vector3(6.6, 0.1, 1.65)), awc);
          }
        }
      }
    } else wallStrip(B[style], pts, y0, h, f.tileW, f.tileH, col, uOff, vOff - y0 / f.tileH);
    // roof
    col.set(style === 'glass' ? 0x8a9096 : 0xd8d2c8).multiplyScalar(rr(0.85, 1.05));
    capPoly(B.roof, pts, h, col, 1 / 6);
    if (pitched) {
      const rg = new THREE.ConeGeometry(1, 1, 4, 1); rg.rotateY(Math.PI / 4);
      B.trim.addGeometry(rg, mat4(cx, h + 1.3, cz, 0, (w + 1.2) * 0.7072, 2.6, (d + 1.2) * 0.7072), new THREE.Color(pick([0xc8643c, 0xb85a38, 0xd2774a, 0xa94f32])));
      roofDetails = false;
    } else if (style !== 'glass') parapet(B.roof, pts, h, 0.9, 0.35, col);
    else parapet(B.trim, pts, h, 2.2, 0.5, new THREE.Color(0x3c434a));
    if (collider) box(cx, (h + y0) / 2, cz, w / 2, (h - y0) / 2, d / 2);
    buildings.push({ x: cx, z: cz, w, d, h });
    if (roofDetails && w > 8 && d > 8) {
      const n = Math.min(6, 1 + ((w * d) / 250) | 0);
      for (let i = 0; i < n; i++) inst.ac.push({ x: cx + rr(-w / 2 + 2.5, w / 2 - 2.5), y: h, z: cz + rr(-d / 2 + 2.5, d / 2 - 2.5), ry: R() < 0.5 ? 0 : Math.PI / 2, s: rr(0.8, 1.3) });
      if (style === 'office' && h < 45 && R() < 0.35) inst.tank.push({ x: cx + rr(-w / 4, w / 4), y: h, z: cz + rr(-d / 4, d / 4), s: rr(0.9, 1.2) });
    }
    return pts;
  }

  // ---- building archetypes ----
  // sign atlas (2 cols x 5 rows): 0-5 hotels, 6-7 motels, 8 SOLGAS, 9 OPEN 24H
  const SIGN_NAMES = ['HOTEL MARLOW', 'THE CORALINE', 'SEABREEZE INN', 'HOTEL SOL', 'PALM COURT', 'AZURE SUITES', 'MOTEL FLAMINGA', 'SUNSET MOTOR INN', 'SOLGAS', 'OPEN 24H'];
  const signPlane = (x, y, z, ry, w2, h2, k, off = 0.2) => {
    const pg = new THREE.PlaneGeometry(w2, h2), c2 = k % 2, r2 = Math.floor(k / 2), sx = Math.sin(ry) * off, sz = Math.cos(ry) * off;
    B.sign.addGeometry(pg, mat4(x + sx, y, z + sz, ry), 0xffffff, [0.5, 0.2], [c2 * 0.5, 1 - (r2 + 1) * 0.2]);
    B.sign.addGeometry(pg, mat4(x - sx, y, z - sz, ry + Math.PI), 0xffffff, [0.5, 0.2], [c2 * 0.5, 1 - (r2 + 1) * 0.2]);
  };
  const faceInfo = (px, pz, w, d, f) => ({ fx: px + f[0] * (w / 2), fz: pz + f[1] * (d / 2), along: Math.abs(f[0]) > 0.5 ? d : w, tx: Math.abs(f[0]) > 0.5 ? 0 : 1, tz: Math.abs(f[0]) > 0.5 ? 1 : 0, ry: Math.atan2(f[0], f[1]) });
  function garage(px, pz, w, d, levels) {
    if (lotRectBlocked(px, pz, w, d)) return;
    const H = levels * 3.1, gc = new THREE.Color(0xcfc9be), dark = new THREE.Color(0x3e3c39);
    trimBox(px, CURB + H / 2, pz, w - 1.4, H, d - 1.4, dark);
    for (let l = 1; l <= levels; l++) { const y = CURB + l * 3.1; trimBox(px, y - 0.2, pz, w, 0.4, d, gc); wallStrip(B.trim, rectPts(px, pz, w + 0.02, d + 0.02), y, y + 1.05, 10, 10, gc); }
    for (let u = -w / 2 + 0.3; u <= w / 2 - 0.2; u += Math.max(4, (w - 0.6) / Math.round((w - 0.6) / 8.5))) for (const sz of [-1, 1]) trimBox(px + u, CURB + H / 2, pz + sz * (d / 2 - 0.3), 0.6, H, 0.6, gc);
    for (let u = -d / 2 + 0.3; u <= d / 2 - 0.2; u += Math.max(4, (d - 0.6) / Math.round((d - 0.6) / 8.5))) for (const sx of [-1, 1]) trimBox(px + sx * (w / 2 - 0.3), CURB + H / 2, pz + u, 0.6, H, 0.6, gc);
    col.set(0x2a7fff); B.neon.addGeometry(BOXG, mat4(px + w / 2 + 0.06, CURB + H - 0.9, pz - d / 2 + 3, 0, 0.08, 1.6, 1.6), col);
    for (let k = 0; k < 4; k++) inst.lamp.push({ x: px + (k % 2 ? 1 : -1) * (w / 2 - 2), y: CURB + H + 1.05, z: pz + (k < 2 ? 1 : -1) * (d / 2 - 2), ry: Math.PI / 4 + k, s: 0.6 });
    box(px, CURB + (H + 1.05) / 2, pz, w / 2, (H + 1.05) / 2, d / 2); buildings.push({ x: px, z: pz, w, d, h: H + 1 });
  }
  function motel(px, pz, w, d, f) {
    if (lotRectBlocked(px, pz, w, d)) return;
    const h = 6.8, color = pick(PASTELS), acc = new THREE.Color(pick(ACCENTS)), wc = new THREE.Color(0xfbfaf6);
    addBuilding({ cx: px, cz: pz, w, d, h, style: 'deco', color });
    const F = faceInfo(px, pz, w, d, f), [nx, nz] = f, L = F.along - 1;
    const at = (o, u, y, sw, sh, sd, c) => B.trim.addGeometry(BOXG, mat4(F.fx + nx * o + F.tx * u, y, F.fz + nz * o + F.tz * u, F.ry, sw, sh, sd), c);
    at(0.95, 0, CURB + 3.35, L, 0.22, 1.9, wc); at(0.95, 0, h + 0.1, L + 0.6, 0.25, 2.0, acc);
    at(1.85, 0, CURB + 3.95, L, 0.9, 0.06, acc); at(1.85, 0, CURB + 4.45, L, 0.08, 0.14, wc);
    for (let u = -L / 2; u <= L / 2 + 0.01; u += L / Math.max(1, Math.round(L / 3.6))) { at(1.8, u, (CURB + h) / 2, 0.18, h - CURB, 0.18, wc); const cxp = F.fx + nx * 1.8 + F.tx * u, czp = F.fz + nz * 1.8 + F.tz * u; box(cxp, CURB + 1.6, czp, 0.12, 1.6, 0.12); }
    at(1.0, L / 2 + 1.4, CURB + 1.75, 2.2, 3.4, 1.8, wc);
    const sx = F.fx + nx * 4.2 + F.tx * (-L / 2 + 1), sz = F.fz + nz * 4.2 + F.tz * (-L / 2 + 1);
    if (!lotBlocked(sx, sz, 1)) {
      trimBox(sx, CURB + 4, sz, 0.35, 8, 0.35, 0x8a8f94); cyl(sx, CURB + 4, sz, 4, 0.25);
      trimBox(sx, CURB + 8.6, sz, 0.3, 1.8, 6.4, acc, F.ry + Math.PI / 2);
      signPlane(sx, CURB + 8.6, sz, F.ry, 6.2, 1.55, 6 + ((R() * 2) | 0), 0.17);
    }
  }
  function gasStation(cx, cz) {
    const wc = new THREE.Color(0xf6f6f6), red = new THREE.Color(0xe63946);
    trimBox(cx, CURB + 5.6, cz, 18, 0.9, 12, wc);
    col.set(0xff3046); wallStrip(B.neon, rectPts(cx, cz, 18.1, 12.1), CURB + 5.2, CURB + 5.45, 10, 10, col);
    col.set(0xfff4e0); B.neon.addGeometry(BOXG, mat4(cx, CURB + 5.13, cz, 0, 15, 0.04, 9), col);
    for (const [ox, oz] of [[-6, -3.6], [6, -3.6], [-6, 3.6], [6, 3.6]]) { trimBox(cx + ox, CURB + 2.6, cz + oz, 0.6, 5.2, 0.6, wc); box(cx + ox, CURB + 2.6, cz + oz, 0.3, 2.6, 0.3); }
    for (const oz of [-2.4, 2.4]) { trimBox(cx, CURB + 0.1, cz + oz, 11, 0.2, 1.4, 0xbbbbbb); box(cx, CURB + 0.1, cz + oz, 5.5, 0.1, 0.7);
      for (const ox of [-3.5, 3.5]) { trimBox(cx + ox, CURB + 1.05, cz + oz, 0.9, 1.7, 0.6, red); trimBox(cx + ox, CURB + 1.5, cz + oz + 0.31, 0.5, 0.35, 0.02, 0x111111); box(cx + ox, CURB + 1, cz + oz, 0.45, 0.9, 0.3); } }
    const spts = rectPts(cx, cz + 13, 16, 8);
    wallStrip(B.shop, spts, CURB, CURB + 4.4, 64, 4.4 - CURB, new THREE.Color(0xffffff), ((R() * 8) | 0) / 8, 0);
    capPoly(B.roof, spts, CURB + 4.4, new THREE.Color(0xd8d2c8)); parapet(B.trim, spts, CURB + 4.4, 0.8, 0.3, red);
    box(cx, CURB + 2.6, cz + 13, 8, 2.6, 4); buildings.push({ x: cx, z: cz + 13, w: 16, d: 8, h: 4.4 });
    const px2 = cx - 10, pz2 = cz - 7;
    trimBox(px2, CURB + 4.5, pz2, 0.4, 9, 0.4, 0x8a8f94); cyl(px2, CURB + 4.5, pz2, 4.5, 0.25);
    trimBox(px2, CURB + 8.4, pz2, 4.6, 2.6, 0.4, 0x1d3557);
    signPlane(px2, CURB + 8.9, pz2, 0, 4.4, 1.1, 8, 0.22); signPlane(px2, CURB + 7.7, pz2, 0, 4.4, 1.1, 9, 0.22);
  }
  function hotelSign(px, pz, w, d, h, f) {
    const F = faceInfo(px, pz, w, d, f); if (F.along < 14) return;
    const x = F.fx - f[0] * 1.0, z = F.fz - f[1] * 1.0;
    trimBox(x, h + 1.3, z, Math.abs(f[0]) > 0.5 ? 0.3 : 12, 2.6, Math.abs(f[0]) > 0.5 ? 12 : 0.3, 0x2b2b2b);
    signPlane(x, h + 1.6, z, F.ry, 12, 3, (R() * 6) | 0, 0.17);
  }
  function addTower(cx, cz, w, d, h) {
    if (lotRectBlocked(cx, cz, w, d)) return;
    const style = R() < 0.62 ? 'glass' : R() < 0.5 ? 'band' : 'office';
    const color = style === 'glass' ? pick(GLASS_TINTS) : pick(OFFICE_TINTS);
    const kind = R();
    if (kind < 0.25) {
      // rounded / cylindrical-ish tower
      addBuilding({ cx, cz, w, d, h, style, color, rounded: Math.min(w, d) * rr(0.25, 0.48), roofDetails: false });
    } else if (kind < 0.7) {
      // setback tower
      const h1 = h * rr(0.55, 0.7), h2 = h * rr(0.82, 0.9);
      addBuilding({ cx, cz, w, d, h: h1, style, color, roofDetails: false });
      addBuilding({ cx, cz, w: w - 6, d: d - 6, h: h2, y0: h1, style, color, roofDetails: false, collider: false });
      box(cx, (h1 + h2) / 2, cz, (w - 6) / 2, (h2 - h1) / 2, (d - 6) / 2);
      addBuilding({ cx, cz, w: w - 12, d: d - 12, h, y0: h2, style, color, roofDetails: false, collider: false });
      box(cx, (h2 + h) / 2, cz, (w - 12) / 2, (h - h2) / 2, (d - 12) / 2);
      w -= 12; d -= 12;
    } else {
      addBuilding({ cx, cz, w, d, h, style, color, roofDetails: false });
      if (style !== 'glass' && R() < 0.6) { // condo: balcony stacks with glass railings on two faces
        const gr = new THREE.Color(0xbfe6f0), sl = new THREE.Color(0xf2efe8);
        for (let y = CURB + 6.6; y < h - 3; y += 3.2) for (const sz of [-1, 1]) {
          trimBox(cx, y, cz + sz * (d / 2 + 0.8), w - 4, 0.18, 1.6, sl);
          trimBox(cx, y + 0.55, cz + sz * (d / 2 + 1.57), w - 4, 1.0, 0.05, gr);
        }
      } else if (style === 'glass' && R() < 0.6) { // vertical aluminium fins
        const fc = new THREE.Color(0xd8dde2);
        for (let u = -w / 2 + 1.5; u <= w / 2 - 1.5; u += 3.5) for (const sz of [-1, 1]) trimBox(cx + u, (CURB + h) / 2, cz + sz * (d / 2 + 0.35), 0.25, h - CURB, 0.7, fc);
        for (let u = -d / 2 + 1.5; u <= d / 2 - 1.5; u += 3.5) for (const sx of [-1, 1]) trimBox(cx + sx * (w / 2 + 0.35), (CURB + h) / 2, cz + u, 0.7, h - CURB, 0.25, fc);
      }
    }
    // crown neon ring on some towers
    if (R() < 0.45) {
      const pts = rectPts(cx, cz, w + 0.3, d + 0.3);
      col.set(pick(NEONS));
      wallStrip(B.neon, pts, h - 1.2, h - 0.8, 10, 10, col);
    }
    // spire on the tallest towers
    if (h > 150) {
      const sh = rr(25, 45);
      B.trim.addGeometry(new THREE.CylinderGeometry(0.3, 1.6, sh, 8), mat4(cx, h + sh / 2, cz), new THREE.Color(0xdfe6ec));
      col.set(pick(NEONS)); B.neon.addGeometry(new THREE.CylinderGeometry(1.75, 1.75, 0.5, 12), mat4(cx, h + 3, cz), col);
      B.neon.addGeometry(new THREE.CylinderGeometry(1.0, 1.0, 0.4, 12), mat4(cx, h + sh * 0.5, cz), col);
      inst.beacon.push({ x: cx, y: h + sh + 0.2, z: cz });
      for (let i = 0; i < 4; i++) inst.ac.push({ x: cx + rr(-w / 2 + 3, w / 2 - 3), y: h, z: cz + rr(-d / 2 + 3, d / 2 - 3), ry: 0, s: rr(1, 1.6) });
    } else if (w >= 22 && d >= 22 && R() < 0.4) {
      inst.heli.push({ x: cx, y: h + (style === 'glass' ? 2.3 : 1.0), z: cz });
      inst.beacon.push({ x: cx + w / 2 - 1, y: h + 2.5, z: cz + d / 2 - 1 });
    } else {
      const ah = rr(8, 26);
      inst.antenna.push({ x: cx + rr(-2, 2), y: h, z: cz + rr(-2, 2), sy: ah });
      inst.beacon.push({ x: inst.antenna[inst.antenna.length - 1].x, y: h + ah, z: inst.antenna[inst.antenna.length - 1].z });
      for (let i = 0; i < 4; i++) inst.ac.push({ x: cx + rr(-w / 2 + 3, w / 2 - 3), y: h, z: cz + rr(-d / 2 + 3, d / 2 - 3), ry: 0, s: rr(1, 1.6) });
    }
  }

  function decoBuilding(cx, cz, w, d, h, frontDir /* [nx,nz] */) {
    if (lotRectBlocked(cx, cz, w, d)) return null;
    const color = pick(PASTELS), accent = pick(ACCENTS), neon = pick(NEONS);
    const rnd = rr(2, 4.5);
    const pts = addBuilding({ cx, cz, w, d, h, style: 'deco', color, rounded: rnd });
    // accent bands
    col.set(accent);
    const band = roundRectPts(cx, cz, w + 0.25, d + 0.25, rnd + 0.12, 4);
    if (h > 7) wallStrip(B.trim, band, 4.5, 5.0, 10, 10, col);
    if (R() < 0.6) wallStrip(B.trim, band, h - 2.2, h - 1.6, 10, 10, col);
    // neon roofline
    col.set(neon);
    const nb = roundRectPts(cx, cz, w + 0.32, d + 0.32, rnd + 0.16, 4);
    wallStrip(B.neon, nb, h - 0.35, h - 0.12, 10, 10, col);
    if (h > 7) wallStrip(B.neon, nb, 5.0, 5.12, 10, 10, col);
    const [nx, nz] = frontDir;
    addLean(cx + nx * (w / 2), cz + nz * (d / 2), nx, nz, Math.abs(nx) > 0.5 ? d : w, Math.abs(nx) > 0.5 ? 0 : 1, Math.abs(nx) > 0.5 ? 1 : 0);
    // facade detail (beach-side districts): eyebrow ledges, balconies, wall AC units, portholes
    if (h >= 9.5 && cx > 220) {
      const GF = 4.2, wc = new THREE.Color(0xfbfaf6), ac = new THREE.Color(accent);
      const eb = roundRectPts(cx, cz, w + 0.9, d + 0.9, rnd + 0.45, 4);
      for (let m = 0; ; m++) {
        const ye = GF + (m + 1) * 3.4 - 0.66; if (ye > h - 1.0) break;
        wallStrip(B.trim, eb, ye, ye + 0.1, 10, 10, wc); capPoly(B.trim, eb, ye + 0.1, wc); capDown(B.trim, eb, ye, wc);
      }
      const alongF = Math.abs(nx) > 0.5 ? d : w, tx = Math.abs(nx) > 0.5 ? 0 : 1, tz = 1 - tx;
      const ffx = cx + nx * (w / 2), ffz = cz + nz * (d / 2), fry = Math.atan2(nx, nz);
      for (let m = 1; GF + m * 3.4 + 1.2 < h - 1; m++) {
        const yb = GF + m * 3.4;
        for (const u of [-0.25, 0.25]) {
          const bx = ffx + tx * u * alongF, bz = ffz + tz * u * alongF;
          const at = (o, y, sw, sh, sd) => B.trim.addGeometry(BOXG, mat4(bx + nx * o, y, bz + nz * o, fry, sw, sh, sd), y > yb + 0.9 ? ac : wc);
          at(0.55, yb + 0.07, 3.2, 0.15, 1.1);           // slab
          at(1.07, yb + 0.55, 3.2, 0.85, 0.06);          // front parapet
          at(1.07, yb + 1.02, 3.3, 0.08, 0.12);          // accent top rail
          for (const sgn of [-1, 1]) B.trim.addGeometry(BOXG, mat4(bx + nx * 0.55 + tx * sgn * 1.57, yb + 0.55, bz + nz * 0.55 + tz * sgn * 1.57, fry, 0.06, 0.85, 1.1), wc);
        }
      }
      for (const [fxn, fzn] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (fxn === nx && fzn === nz) continue;
        const span = (Math.abs(fxn) > 0 ? d : w) - 2 * rnd - 2; if (span < 2) continue;
        const fcx = cx + fxn * (w / 2), fcz = cz + fzn * (d / 2);
        for (let k = 0; k < 2; k++) {
          const u = (R() - 0.5) * span, m = (R() * Math.max(1, Math.floor((h - GF) / 3.4) - 1)) | 0;
          const y = GF + (m + 1) * 3.4 - 2.85; if (y > h - 1) continue;
          inst.wallAC.push({ x: fcx + fxn * 0.3 + Math.abs(fzn) * u, y, z: fcz + fzn * 0.3 + Math.abs(fxn) * u, ry: Math.atan2(fxn, fzn) });
        }
      }
      const pu = (alongF / 2 - rnd - 1.3) * (R() < 0.5 ? -1 : 1);
      for (let m = 0; GF + m * 3.4 + 2.2 < h - 1; m++) inst.porthole.push({ x: ffx + nx * 0.06 + tx * pu, y: GF + m * 3.4 + 1.75, z: ffz + nz * 0.06 + tz * pu, ry: fry });
    }
    // front canopy + vertical fin sign
    const fx = cx + nx * (w / 2), fz = cz + nz * (d / 2);
    const along = Math.abs(nx) > 0.5 ? d : w;
    const ry = Math.atan2(nx, nz);
    // canopy
    const cw = along * 0.55;
    trimBox(fx + nx * 1.2, 4.32, fz + nz * 1.2, Math.abs(nx) > 0.5 ? 2.4 : cw, 0.25, Math.abs(nx) > 0.5 ? cw : 2.4, 0xfafafa);
    // fin
    if (R() < 0.75) {
      const fh = h * 0.7 + 4, fy = h * 0.3 + fh / 2;
      const off = (R() - 0.5) * along * 0.4;
      const ox = fx + nx * 0.7 + (Math.abs(nx) > 0.5 ? 0 : off), oz = fz + nz * 0.7 + (Math.abs(nx) > 0.5 ? off : 0);
      B.trim.addGeometry(BOXG, mat4(ox, fy, oz, ry, 0.5, fh, 1.4), new THREE.Color(accent).lerp(new THREE.Color(0xffffff), 0.35));
      col.set(neon);
      B.neon.addGeometry(BOXG, mat4(ox + nx * 0.71, fy, oz + nz * 0.71, ry, 0.56, fh, 0.06), col);
      B.neon.addGeometry(BOXG, mat4(ox, h * 0.3 + fh + 0.05, oz, ry, 0.56, 0.12, 1.46), col);
      { const k = (R() * 8) | 0, pg = new THREE.PlaneGeometry(1.25, fh * 0.86); const sxn = Math.cos(ry), szn = -Math.sin(ry);
        for (const sg of [1, -1]) B.fin.addGeometry(pg, mat4(ox + sxn * 0.27 * sg, fy - fh * 0.03, oz + szn * 0.27 * sg, ry + sg * Math.PI / 2), 0xffffff, [1 / 8, 1], [k / 8, 0]); }
    }
    // stepped crown (ziggurat) on some
    if (R() < 0.45) {
      const cw2 = Math.min(w, d) * 0.35;
      addBuilding({ cx, cz, w: cw2 * (Math.abs(nx) > 0.5 ? 0.6 : 1), d: cw2 * (Math.abs(nx) > 0.5 ? 1 : 0.6), h: h + 3.2, y0: h, style: 'deco', color, roofDetails: false });
      col.set(neon); wallStrip(B.neon, rectPts(cx, cz, cw2 * (Math.abs(nx) > 0.5 ? 0.6 : 1) + 0.2, cw2 * (Math.abs(nx) > 0.5 ? 1 : 0.6) + 0.2), h + 2.9, h + 3.1, 10, 10, col);
    }
    return pts;
  }

  function capDown(b, pts, y, c) {
    let mx = 0, mz = 0; for (const p of pts) { mx += p[0]; mz += p[1]; } mx /= pts.length; mz /= pts.length;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; b.vert(mx, y, mz, 0, -1, 0, 0, 0, c); b.vert(q[0], y, q[1], 0, -1, 0, 0, 0, c); b.vert(p[0], y, p[1], 0, -1, 0, 0, 0, c); }
  }
  // ---------- fountain ----------
  function fountain(x, z, r = 5) {
    const g = new THREE.CylinderGeometry(r, r + 0.3, 0.7, 28);
    B.trim.addGeometry(g, mat4(x, CURB + 0.35, z), 0xf3ece0);
    const water = new THREE.Mesh(new THREE.CircleGeometry(r - 0.3, 28), M.water);
    water.rotation.x = -Math.PI / 2; water.position.set(x, CURB + 0.62, z); root.add(water);
    B.trim.addGeometry(new THREE.CylinderGeometry(0.6, 0.9, 2.6, 12), mat4(x, CURB + 1.3, z), 0xf3ece0);
    B.trim.addGeometry(new THREE.CylinderGeometry(1.8, 0.4, 0.4, 16), mat4(x, CURB + 2.6, z), 0xf3ece0);
    cyl(x, CURB + 0.4, z, 0.4, r + 0.2);
  }

  // ---------- blocks ----------
  const blockList = [];
  for (const [x0, x1] of xb) for (const [z0, z1] of zb) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const type = district(cx, cz, w, d);
    blockList.push({ x0, x1, z0, z1, cx, cz, w, d, type });
    // slab (sidewalk + lot base) with curb collider
    col.set(type === 'promenade' ? 0xfff4ec : pick([0xe8e4de, 0xf2e4d2, 0xe2e6e8, 0xf4dcd0, 0xeee8dc, 0xdfe2da]));
    B.slab.addGeometryWorldUV(BOXG, mat4(cx, CURB / 2, cz, 0, w, CURB, d), col, 1 / 3);
    box(cx, CURB / 2, cz, w / 2, CURB / 2, d / 2);
    // curb stone strip
    for (const [sx, sz, sw, sd] of [[cx, z0 + 0.15, w, 0.3], [cx, z1 - 0.15, w, 0.3], [x0 + 0.15, cz, 0.3, d], [x1 - 0.15, cz, 0.3, d]])
      B.trim.addGeometry(BOXG, mat4(sx, CURB / 2 + 0.006, sz, 0, sw + 0.02, CURB + 0.012, sd + 0.02), 0xcfcac2);
    // sidewalk segments & street furniture along road-facing sides
    const sides = [
      { has: roadAtZ(z0 - HW), ax: 'x', c: z0, n: [0, -1], a: x0, b: x1 },
      { has: roadAtZ(z1 + HW), ax: 'x', c: z1, n: [0, 1], a: x0, b: x1 },
      { has: roadAtX(x0 - HW), ax: 'z', c: x0, n: [-1, 0], a: z0, b: z1 },
      { has: roadAtX(x1 + HW) || type === 'promenade', ax: 'z', c: x1, n: [1, 0], a: z0, b: z1 },
    ];
    const palmy = type === 'deco' || type === 'promenade' || type === 'tower' || type === 'decomid' || type === 'plaza' || type === 'park' || R() < 0.4;
    for (const s of sides) {
      if (!s.has) continue;
      const beachSide = type === 'promenade' && s.n[0] === 1;
      const inset = 2.5;
      const P = (t, off) => s.ax === 'x' ? [t, s.c - s.n[1] * off] : [s.c - s.n[0] * off, t];
      if (!beachSide) {
        const [p0x, p0z] = P(s.a + 3, inset), [p1x, p1z] = P(s.b - 3, inset);
        sidewalkSegs.push({ x0: p0x, z0: p0z, x1: p1x, z1: p1z, len: s.b - s.a - 6 });
      }
      const L = s.b - s.a;
      const ry = Math.atan2(s.n[0], s.n[1]);
      if (!beachSide) {
        const nl = Math.max(1, Math.floor((L - 16) / 30));
        for (let i = 0; i <= nl; i++) {
          const t = s.a + 8 + ((L - 16) * i) / nl; const [lx, lz] = P(t, 0.7);
          inst.lamp.push({ x: lx, y: CURB, z: lz, ry });
          inst.pool.push({ x: lx + s.n[0] * 1.2, y: 0.165, z: lz + s.n[1] * 1.2, s: 1.35 });
          cyl(lx, CURB + 3.6, lz, 3.6, 0.14);
        }
      }
      if (palmy) {
        const sp = type === 'promenade' || type === 'deco' ? 14 : 20;
        const np = Math.floor((L - 16) / sp);
        for (let i = 0; i < np; i++) {
          const t = s.a + 8 + sp / 2 + i * sp + rr(-1, 1); const [px, pz] = P(t, beachSide ? 1.5 : 1.1);
          const placed = addPalm(px, pz, CURB, null, (type === 'tower' || type === 'plaza' || type === 'park' || type === 'mid') ? 'royal' : 'coco');
          if (placed && beachSide) inst.uplight.push({ x: px - 0.7, y: CURB, z: pz });
          if (!beachSide && !lotBlocked(px, pz, 1.5)) inst.grate.push({ x: px, y: CURB + 0.004, z: pz, ry });
        }
      }
      if (!beachSide && L > 40) {
        // accent tile bands: darker band along the frontage + thin inlay line
        if (type !== 'low' && type !== 'edge') {
          const bc = new THREE.Color(pick([0xb9a48c, 0x9ca4a8, 0xc48a6c, 0xa8b0a0])).multiplyScalar(0.95);
          const [ax, az] = P(s.a + 5, 4.3), [bx2, bz2] = P(s.b - 5, 4.95);
          B.slab.hquad(Math.min(ax, bx2), Math.min(az, bz2), Math.max(ax, bx2), Math.max(az, bz2), CURB + 0.004, bc, 1 / 1.5);
          const [cx3, cz3] = P(s.a + 5, 2.2), [dx3, dz3] = P(s.b - 5, 2.45);
          B.slab.hquad(Math.min(cx3, dx3), Math.min(cz3, dz3), Math.max(cx3, dx3), Math.max(cz3, dz3), CURB + 0.004, bc, 1 / 1.5);
        }
        // tree-lawn grass strip between curb and walkway (residential / mid-rise streets)
        if (type === 'low' || type === 'mid' || type === 'decomid' || type === 'park') {
          const [ax, az] = P(s.a + 9, 0.35), [bx2, bz2] = P(s.b - 9, 1.75);
          B.grass.hquad(Math.min(ax, bx2), Math.min(az, bz2), Math.max(ax, bx2), Math.max(az, bz2), CURB + 0.006, 0xffffff, 1 / 8);
          for (let t = s.a + 14; t < s.b - 14; t += rr(9, 16)) { const [fx, fz] = P(t, 1.05); if (R() < 0.6) addBush(fx, fz, 0.8); }
        }
        // clay pots with plants flanking shop doors
        if (mPot && (type === 'deco' || type === 'decomid' || type === 'mid' || type === 'tower') && R() < 0.6) {
          const t0 = s.a + L * rr(0.4, 0.5);
          for (const o of [-1.4, 1.4]) { const [ppx, ppz] = P(t0 + o, 4.55); if (lotBlocked(ppx, ppz, 1)) continue; inst.pot.push({ x: ppx, y: CURB, z: ppz, ry: R() * 6 }); inst.fern.push({ x: ppx, y: CURB + 0.5, z: ppz, ry: R() * 6, s: 1.5 }); cyl(ppx, CURB + 0.3, ppz, 0.3, 0.35); }
        }
        // cafe tables + umbrellas in front of shops
        if ((type === 'deco' || type === 'decomid' || type === 'plaza' || type === 'tower' || (type === 'mid' && R() < 0.4)) && R() < 0.75) {
          const t0 = s.a + L * rr(0.12, 0.2);
          for (let k = 0; k < 3; k++) {
            const [cx2, cz2] = P(t0 + k * 3.2, 3.7);
            if (lotBlocked(cx2, cz2, 1.5)) continue;
            const cry = ry + R() * 0.6; inst.cafe.push({ x: cx2, y: CURB, z: cz2, ry: cry }); box(cx2, CURB + 0.45, cz2, 1.2, 0.45, 0.3, cry);
            inst.umbrella.push({ x: cx2, y: CURB, z: cz2, ry: R() * 6, color: pick([0xff5d8f, 0x2ec4b6, 0xffb703, 0xffffff, 0x7b61ff, 0xe63946, 0x06d6a0]) });
            cyl(cx2, CURB + 0.4, cz2, 0.4, 0.5);
          }
        }
        // sidewalk planters / flower beds near buildings
        if (type !== 'low' && type !== 'edge' && R() < 0.7) { const [qx, qz] = P(s.a + L * rr(0.55, 0.7), 3.9); addPlanter(qx, qz, s.ax === 'x' ? 0 : Math.PI / 2); }
        // newspaper boxes near the corner
        if (R() < 0.45) for (let k = 0; k < 2 + ((R() * 2) | 0); k++) {
          const [nx2, nz2] = P(s.b - 6.5 - k * 0.65, 4.1);
          if (lotBlocked(nx2, nz2, 1)) break;
          inst.news.push({ x: nx2, y: CURB, z: nz2, ry: ry + Math.PI, color: pick([0x1e88e5, 0xe53935, 0xffb300, 0x43a047, 0xffffff]) });
          box(nx2, CURB + 0.55, nz2, 0.27, 0.55, 0.25, ry);
        }
        // bike racks
        if ((type === 'tower' || type === 'plaza' || type === 'park' || type === 'deco') && R() < 0.5) {
          const [rx2, rz2] = P(s.a + L * 0.82, 4.0);
          if (!lotBlocked(rx2, rz2, 2)) { inst.bike.push({ x: rx2, y: CURB, z: rz2, ry }); box(rx2, CURB + 0.45, rz2, 2.2, 0.45, 0.1, ry); }
        }
        // stains & cracks
        for (let k = 0; k < 4; k++) { const [sx2, sz2] = P(s.a + R() * L, rr(0.8, 4.5)); (R() < 0.5 ? inst.stain : inst.crack).push({ x: sx2, y: CURB + 0.007, z: sz2, ry: R() * 6, s: rr(0.6, 1.6) }); }
        // oil stains on the lane near the stop line
        { const [ox2, oz2] = P(s.b - 12, -1.75 - 3.5 * (R() < 0.5 ? 1 : 0) + 0); inst.stain.push({ x: ox2 - s.n[0] * 0, y: 0.014, z: oz2, ry: R() * 6, s: rr(1.2, 2.2) }); }
        // street clutter: hydrant, bins, bus stop
        if (R() < 0.65) { const ht = s.a + rr(9, L - 9); const [hx, hz] = P(ht, 0.6); if (!lotBlocked(hx, hz, 1)) { inst.hydrant.push({ x: hx, y: CURB, z: hz, ry: ry + rr(-0.5, 0.5) }); cyl(hx, CURB + 0.4, hz, 0.4, 0.16);
          const [ex, ez] = P(ht, 0.15); trimBox(ex, CURB / 2 + 0.008, ez, s.ax === 'x' ? 8 : 0.33, CURB + 0.02, s.ax === 'x' ? 0.33 : 8, 0xc62828); } }
        for (let k = 0; k < (R() < 0.5 ? 2 : 1); k++) { const [bx, bz] = P(s.a + rr(6, L - 6), 0.75); if (lotBlocked(bx, bz, 1)) continue; const kb = R(); (kb < 0.45 ? inst.bin : kb < 0.75 ? inst.bin2 : inst.bin3).push({ x: bx, y: CURB, z: bz, ry: ry + rr(-0.3, 0.3) }); cyl(bx, CURB + 0.5, bz, 0.5, 0.36); }
        for (let k = 0; k < 3; k++) { const [lx2, lz2] = P(s.a + R() * L, rr(0.3, 4.6)); inst.litter.push({ x: lx2, y: CURB + 0.012, z: lz2, ry: R() * 6, color: pick([0xffffff, 0xf2f2f2, 0xd8261c, 0x2a6fdb, 0xe8d8b0, 0x55aa55]) }); }
        if (R() < 0.25) { const [qx2, qz2] = P(s.a + rr(10, L - 10), -0.9); inst.puddle.push({ x: qx2, y: 0.016, z: qz2, ry: R() * 6, s: rr(0.8, 1.6) }); }
        if (R() < 0.16 && type !== 'edge' && type !== 'promenade') {
          const t = s.a + L * rr(0.3, 0.42); const [sx, sz] = P(t, 3.0);
          inst.busStop.push({ x: sx, y: CURB, z: sz, ry });
          const lb = (lx, ly, lz, hx, hy, hz) => box(sx + lx * Math.cos(ry) + lz * Math.sin(ry), CURB + ly, sz - lx * Math.sin(ry) + lz * Math.cos(ry), hx, hy, hz, ry);
          lb(0, 1.3, -0.75, 2.0, 1.1, 0.05); lb(-2.0, 1.25, 0, 0.05, 1.25, 0.85); lb(2.0, 1.25, 0, 0.05, 1.25, 0.85);
          lb(0, 0.26, -0.45, 1.5, 0.26, 0.2); lb(0, 2.55, 0, 2.1, 0.08, 0.95);
        }
      }
    }
    fillBlock(blockList[blockList.length - 1]);
  }

  function addPalm(x, z, y = CURB, s = null, kind = 'coco') {
    if (lotBlocked(x, z, 1.5)) return false;
    const arr = kind === 'royal' ? inst.royal : kind === 'palmetto' ? inst.palmetto : inst.palm;
    const v = (R() * arr.length) | 0;
    const c = new THREE.Color().setHSL(rr(0.2, 0.3), rr(0.25, 0.6), rr(0.42, 0.56)).multiplyScalar(1.6);
    arr[v].push({ x, y, z, ry: R() * Math.PI * 2, s: (s ?? 1) * rr(0.9, 1.1), color: c });
    if (kind === 'palmetto') { cyl(x, y + 0.6, z, 0.6, 0.45); return true; }
    cyl(x, y + 2, z, 2, 0.28);
    return true;
  }
  function addBush(x, z, s = 1, y = CURB) {
    if (lotBlocked(x, z, 1)) return;
    cyl(x, y + 0.4 * s, z, 0.4 * s, 0.62 * s);
    if (R() < 0.4) { inst.flower[(R() * 5) | 0].push({ x, y: y + 0.3 * s, z, ry: R() * 6, s: s * rr(0.8, 1.3) }); return; }
    inst.bush.push({ x, y: y + 0.3 * s, z, ry: R() * 6, s: s * rr(0.8, 1.3), color: new THREE.Color().setHSL(rr(0.25, 0.36), rr(0.45, 0.7), rr(0.18, 0.32)) }); }
  function addPlanter(x, z, ry) {
    if (lotBlocked(x, z, 2.5)) return;
    planterPos.push([x, z]);
    const kind = R(), pc = pick([0xe9e1d3, 0xd8c4a8, 0xc9705a, 0xf2efe8, 0x8fa3a8, 0xe6d3b3]);
    if (kind < 0.35) { // round planter
      const r = rr(1.0, 1.9), h = rr(0.45, 0.85);
      B.trim.addGeometry(new THREE.CylinderGeometry(r, r * 0.92, h, 16), mat4(x, CURB + h / 2, z), new THREE.Color(pc));
      B.grass.hquad(x - r * 0.7, z - r * 0.7, x + r * 0.7, z + r * 0.7, CURB + h + 0.01, 0xffffff, 1 / 4);
      cyl(x, CURB + h / 2, z, h / 2, r);
      if (r > 1.6 && R() < 0.5) addPalm(x, z, CURB + h, rr(0.6, 0.85)); else addBush(x, z, r * 0.9, CURB + h);
    } else if (kind < 0.65) { // square box
      const a = rr(1.4, 2.4), h = rr(0.5, 0.9);
      trimBox(x, CURB + h / 2, z, a, h, a, pc, ry); box(x, CURB + h / 2, z, a / 2, h / 2, a / 2, ry);
      if (mFern && R() < 0.6) inst.fern.push({ x, y: CURB + h - 0.02, z, ry: R() * 6, s: a * 1.3 }); else addBush(x, z, a * 0.55, CURB + h);
    } else { // long raised bed
      const L2 = rr(3.5, 6), h = rr(0.4, 0.75);
      trimBox(x, CURB + h / 2, z, L2, h, 1.6, pc, ry); box(x, CURB + h / 2, z, L2 / 2, h / 2, 0.8, ry);
      const useFern = mFern && R() < 0.5;
      for (let o = -L2 / 2 + 0.9; o < L2 / 2 - 0.5; o += 1.3) { const bx3 = x + Math.cos(ry) * o, bz3 = z - Math.sin(ry) * o; if (useFern) inst.fern.push({ x: bx3, y: CURB + h - 0.02, z: bz3, ry: R() * 6, s: rr(2.0, 2.6) }); else addBush(bx3, bz3, 0.8, CURB + h); }
    }
  }
  function addBench(x, z, ry, y = CURB) { if (lotBlocked(x, z, 1)) return; inst.bench.push({ x, y, z, ry }); benchList.push({ pos: new THREE.Vector3(x, y, z), heading: ry }); box(x, y + 0.45, z, 0.9, 0.45, 0.35, ry); }

  function fillBlock(bk) {
    const { x0, x1, z0, z1, cx, cz, type } = bk;
    const lx0 = x0 + SW, lx1 = x1 - SW, lz0 = z0 + SW, lz1 = z1 - SW;
    const lw = lx1 - lx0, ld = lz1 - lz0;
    if (type === 'edge') {
      for (let z = z0 + 6; z < z1 - 6; z += 9) { if (R() < 0.35) addPalm(cx, z, CURB, rr(0.8, 1.2), 'palmetto'); else addBush(cx, z, 1.4); if (R() < 0.4) addPalm(cx + rr(-2, 2), z + 4); }
      return;
    }
    if (type === 'promenade') {
      // coral-stone low wall with gaps toward beach
      for (let z = z0 + 2; z < z1 - 2; z += 40) {
        const len = Math.min(34, z1 - 2 - z);
        trimBox(x1 - 0.4, CURB + 0.35, z + len / 2, 0.6, 0.7, len, 0xf4e6d2);
        box(x1 - 0.4, CURB + 0.35, z + len / 2, 0.3, 0.35, len / 2);
        for (let lz = z + 3; lz < z + len - 3; lz += 9) leanSpots.push({ pos: new THREE.Vector3(x1 - 1.15, CURB, lz), heading: -Math.PI / 2 });
        if (R() < 0.6) addBench(x1 - 1.6, z + len / 2, -Math.PI / 2);
      }
      return;
    }
    if (lw < 6 || ld < 6) return;
    if (type === 'park') {
      B.grass.hquad(lx0, lz0, lx1, lz1, CURB + 0.005, 0xffffff, 1 / 8);
      // paths
      col.set(0xf0e6d6);
      B.slab.hquad(cx - 2, lz0, cx + 2, lz1, CURB + 0.012, col, 1 / 3);
      B.slab.hquad(lx0, cz - 2, lx1, cz + 2, CURB + 0.012, col, 1 / 3);
      fountain(cx, cz, 6);
      for (let i = 0; i < 26; i++) {
        const x = rr(lx0 + 3, lx1 - 3), z = rr(lz0 + 3, lz1 - 3);
        if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4) continue;
        if (Math.hypot(x - cx, z - cz) < 10) continue;
        if (R() < 0.6) addPalm(x, z, CURB, null, R() < 0.5 ? 'royal' : 'coco'); else if (R() < 0.3) addPalm(x, z, CURB, rr(0.8, 1.2), 'palmetto'); else if (mShrub && inst.shrub.length < 90 && R() < 0.6) { inst.shrub.push({ x, y: CURB, z, ry: R() * 6, s: rr(0.8, 1.25) }); cyl(x, CURB + 1, z, 1, 0.8); } else addBush(x, z, rr(1, 1.8));
      }
      for (let k = 0; k < 4; k++) { addBench(cx + 3.2, lz0 + 8 + k * 16, -Math.PI / 2); addBench(lx0 + 8 + k * 16, cz - 3.2, 0); }
      return;
    }
    if (type === 'plaza') {
      col.set(0xf6e8d8); B.slab.hquad(lx0, lz0, lx1, lz1, CURB + 0.01, col, 1 / 2);
      fountain(cx, cz, 8);
      for (let i = -2; i <= 2; i++) for (const sgn of [-1, 1]) { addPalm(cx + i * 12, cz + sgn * 22); addPalm(cx + sgn * 22, cz + i * 12 + 6); }
      for (let i = 0; i < 6; i++) addBench(cx + rr(-25, 25), cz + rr(12, 16) * (R() < 0.5 ? -1 : 1), R() < 0.5 ? 0 : Math.PI);
      for (let i = 0; i < 10; i++) addBush(lx0 + 2 + R() * (lw - 4), R() < 0.5 ? lz0 + 2 : lz1 - 2, 1.2);
      return;
    }
    if (type === 'parking') {
      B.lotAsphalt.hquad(lx0, lz0, lx1, lz1, CURB + 0.01, 0xffffff, 1 / 7);
      const gas = R() < 0.6 && !lotRectBlocked(lx0 + 14, lz0 + 17, 30, 36);
      if (gas) gasStation(lx0 + 14, lz0 + 11);
      for (let row = gas ? 1 : 0; row < 3; row++) {
        const zr = lz0 + 6 + row * (ld - 12) / 2;
        for (let x = lx0 + 4; x < lx1 - 4; x += 2.8) B.marks.hquad(x - 0.06, zr - 2.6, x + 0.06, zr + 2.6, CURB + 0.02, 0xf2f2f2);
      }
      for (let x = lx0 + 3; x < lx1; x += 9) addBush(x, lz0 + 1, 1);
      if (R() < 0.7) billboardPole(lx0 + 4, lz0 + 4, Math.PI * 0.25);
      return;
    }
    if (type === 'tower') {
      // podium paving
      col.set(pick([0xeae2d6, 0xf0e6e0, 0xe2e4e0])); B.slab.hquad(lx0, lz0, lx1, lz1, CURB + 0.008, col, 1 / 2);
      { // paving inlays: two concentric bands + grass corner beds
        const ic = [new THREE.Color(pick([0xc98a6a, 0xb07a5a, 0x8f9ea6])), new THREE.Color(pick([0x9aa6ac, 0xd8c8a8, 0x6f7f88]))];
        [[lw / 2 - 7, 1.2, 0], [lw / 2 - 10, 0.6, 1]].forEach(([r, t, k]) => {
          const yI = CURB + 0.011, c = ic[k];
          B.slab.hquad(cx - r, cz - r, cx + r, cz - r + t, yI, c, 1 / 1.5); B.slab.hquad(cx - r, cz + r - t, cx + r, cz + r, yI, c, 1 / 1.5);
          B.slab.hquad(cx - r, cz - r + t, cx - r + t, cz + r - t, yI, c, 1 / 1.5); B.slab.hquad(cx + r - t, cz - r + t, cx + r, cz + r - t, yI, c, 1 / 1.5);
        });
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const gx = cx + ox * (lw / 2 - 4), gz = cz + oz * (ld / 2 - 4);
          if (!lotBlocked(gx, gz, 3)) B.grass.hquad(gx - 3, gz - 3, gx + 3, gz + 3, CURB + 0.013, 0xffffff, 1 / 6);
        }
      }
      const r = Math.hypot(cx + 30, cz);
      const H = (62 + 150 * Math.pow(Math.max(0, 1 - r / 210), 0.8)) * rr(0.75, 1.12);
      if (R() < 0.55) {
        const s = rr(30, 40); addTower(cx, cz, s, s * rr(0.85, 1.1), Math.min(205, H));
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addPalm(cx + ox * (lw / 2 - 4), cz + oz * (ld / 2 - 4));
        // plaza planters + benches between tower and sidewalk
        const ring = (s * 1.1) / 2 + 9;
        for (const [ox, oz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          for (const k of [-1, 1]) {
            const px = cx + ox * ring + (ox === 0 ? k * 12 : 0), pz = cz + oz * ring + (oz === 0 ? k * 12 : 0);
            addPlanter(px, pz, ox === 0 ? 0 : Math.PI / 2);
          }
          addBench(cx + ox * (ring - 2.5), cz + oz * (ring - 2.5), Math.atan2(-ox, -oz) + Math.PI);
        }
      } else {
        const s1 = rr(26, 31), s2 = rr(24, 30);
        addTower(lx0 + s1 / 2 + 3, lz0 + s1 / 2 + 3, s1, s1, Math.min(205, H));
        addTower(lx1 - s2 / 2 - 3, lz1 - s2 / 2 - 3, s2, s2, Math.min(205, H * rr(0.55, 0.85)));
        addPalm(lx1 - 8, lz0 + 8); addPalm(lx0 + 8, lz1 - 8); addBush(lx1 - 14, lz0 + 6, 1.5); addBush(lx0 + 6, lz1 - 14, 1.5);
      }
      return;
    }
    if (type === 'deco') {
      // east row faces beach road, west row faces inner road
      const depth = Math.min(28, lw / 2 - 4);
      for (const side of [1, -1]) {
        let z = lz0 + 1;
        while (z < lz1 - 10) {
          const bw = Math.min(rr(16, 26), lz1 - 1 - z); if (bw < 10) break;
          const h = side === 1 ? rr(11, 24) : rr(9, 18);
          const bx = side === 1 ? lx1 - depth / 2 - 0.5 : lx0 + depth / 2 + 0.5;
          const dpts = decoBuilding(bx, z + bw / 2, depth, bw, h, [side, 0]);
          if (dpts && side === 1 && h > 14 && bw >= 16 && R() < 0.4) hotelSign(bx, z + bw / 2, depth, bw, h, [side, 0]);
          z += bw + rr(2.5, 4);
        }
      }
      // courtyard: pool strip + palms
      const mx = (lx0 + lx1) / 2;
      // hotel pool courtyard
      const pz0 = lz0 + 12, pz1 = lz1 - 12, pzc = (pz0 + pz1) / 2, pl = pz1 - pz0;
      trimBox(mx, CURB + 0.25, pzc, 9, 0.5, pl + 1, 0xf7f3ea);
      B.water.hquad(mx - 4, pz0, mx + 4, pz1, CURB + 0.52, 0xffffff, 1 / 4);
      box(mx, CURB + 0.25, pzc, 4.5, 0.25, pl / 2 + 0.5);
      for (let z = lz0 + 5; z < lz1 - 4; z += 12) { addPalm(mx - 7.5 + rr(-1, 1), z); addPalm(mx + 7.5 + rr(-1, 1), z + 6); }
      for (let z = pz0 + 4; z < pz1 - 2; z += 7) { if (!lotBlocked(mx - 5.6, z)) { inst.lounger.push({ x: mx - 5.6, y: CURB, z, ry: Math.PI / 2, color: pick(ACCENTS) }); box(mx - 5.6, CURB + 0.3, z, 0.8, 0.3, 0.35); } if (!lotBlocked(mx + 5.6, z + 3)) { inst.lounger.push({ x: mx + 5.6, y: CURB, z: z + 3, ry: -Math.PI / 2, color: pick(ACCENTS) }); box(mx + 5.6, CURB + 0.3, z + 3, 0.8, 0.3, 0.35); } }
      return;
    }
    if (type === 'mid' || type === 'decomid' || type === 'low') {
      const low = type === 'low';
      const nx = low ? 3 : R() < 0.5 ? 2 : 3, nz = low ? 3 : R() < 0.5 ? 2 : 3;
      const gap = low ? 6 : 4;
      const pw = (lw - gap * (nx - 1)) / nx, pd = (ld - gap * (nz - 1)) / nz;
      const r = Math.hypot(cx + 30, cz);
      const parcels = [];
      if (low && R() < 0.2 && !lotRectBlocked(cx, cz, lw, ld) && !mallSpots.some(([mx2, mz2]) => Math.hypot(mx2 - cx, mz2 - cz) < 150)) { mallSpots.push([cx, cz]); // strip mall: one-storey shop row at the back, parking in front
        const sw2 = lw - 6, sd2 = 15, sh = 5.4, sz3 = lz1 - sd2 / 2 - 1, pts = rectPts(cx, sz3, sw2, sd2);
        wallStrip(B.shop, pts, CURB, 4.4, 64, 4.4 - CURB, new THREE.Color(0xffffff), ((R() * 8) | 0) / 8, -CURB / (4.4 - CURB));
        wallStrip(B.trim, pts, 4.4, sh, 10, 10, new THREE.Color(pick([0xf4e4c8, 0xe8d8c8, 0xfbefe0])));
        col.set(pick(ACCENTS)); wallStrip(B.trim, rectPts(cx, sz3, sw2 + 0.2, sd2 + 0.2), sh - 0.5, sh - 0.2, 10, 10, col);
        capPoly(B.roof, pts, sh, new THREE.Color(0xd8d2c8));
        for (let k = 0; k < 4; k++) inst.ac.push({ x: cx + rr(-sw2 / 2 + 3, sw2 / 2 - 3), y: sh, z: sz3 + rr(-4, 4), ry: 0, s: 1.2 });
        box(cx, CURB + sh / 2, sz3, sw2 / 2, sh / 2, sd2 / 2); buildings.push({ x: cx, z: sz3, w: sw2, d: sd2, h: sh });
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.38, Math.PI, 0, 'YXZ'));
        for (let u = -sw2 / 2 + 4; u < sw2 / 2 - 3; u += 8) B.trim.addGeometry(BOXG, new THREE.Matrix4().compose(new THREE.Vector3(cx + u, 3.55, sz3 - sd2 / 2 - 0.75), q, new THREE.Vector3(6.6, 0.1, 1.65)), new THREE.Color(pick([0xe85d3f, 0x16a3b8, 0xffcc33, 0x1f8f55, 0xe63946, 0x264b96])));
        trimBox(cx, 4.5, sz3 - sd2 / 2 - 1.6, sw2, 0.25, 3.2, 0xf6f1e6);
        for (let u = -sw2 / 2 + 2; u <= sw2 / 2 - 2; u += 6) { trimBox(cx + u, CURB + 2.15, sz3 - sd2 / 2 - 3.0, 0.3, 4.3, 0.3, 0xf6f1e6); box(cx + u, CURB + 2.15, sz3 - sd2 / 2 - 3.0, 0.15, 2.15, 0.15); }
        const pz0 = lz0 + 1, pz1 = sz3 - sd2 / 2 - 3.5;
        B.lotAsphalt.hquad(lx0 + 1, pz0, lx1 - 1, pz1, CURB + 0.01, 0xffffff, 1 / 7);
        for (const zr of [pz0 + 6, pz1 - 6]) for (let x = lx0 + 5; x < lx1 - 5; x += 2.8) B.marks.hquad(x - 0.06, zr - 2.6, x + 0.06, zr + 2.6, CURB + 0.02, 0xf2f2f2);
        for (let x = lx0 + 10; x < lx1 - 8; x += 18) { addPalm(x, (pz0 + pz1) / 2); addBush(x + 2, (pz0 + pz1) / 2, 1); }
        billboardPole(lx1 - 4, lz0 + 4, -Math.PI * 0.25);
        return;
      }
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const px = lx0 + i * (pw + gap) + pw / 2, pz = lz0 + j * (pd + gap) + pd / 2;
        if (low) B.grass.hquad(px - pw / 2 - gap / 2, pz - pd / 2 - gap / 2, px + pw / 2 + gap / 2, pz + pd / 2 + gap / 2, CURB + 0.006, 0xffffff, 1 / 8);
        if (low && R() < 0.18) { addPalm(px, pz); addBush(px + 3, pz + 2, 1.4); continue; }
        if (!low && R() < 0.12) { // occasional alley puddle
          inst.puddle.push({ x: px + pw / 2 + gap / 2, y: CURB + 0.01, z: pz + rr(-pd / 3, pd / 3), ry: R() * 6, s: rr(0.6, 1.1) }); }
        // front: face the nearest block edge
        const fdir = i === 0 ? [-1, 0] : i === nx - 1 ? [1, 0] : j === 0 ? [0, -1] : [0, 1];
        if (low) {
          const w = pw * rr(0.6, 0.85), d = pd * rr(0.6, 0.85), h = rr(4.5, 9);
          if (R() < 0.12 && w > 14) motel(px, pz, w, d, fdir);
          else if (R() < 0.5) decoBuilding(px, pz, w, d, h, fdir);
          else {
            const pitched = R() < 0.75;
            addBuilding({ cx: px, cz: pz, w, d, h, style: 'deco', color: pick([0xf4e4c8, 0xf2d6b0, 0xfbefe0, 0xe8c9a0, ...PASTELS]), pitched });
            if (pitched && R() < 0.6 && !lotRectBlocked(px, pz, w, d)) { // Mediterranean-revival loggia: arcade columns + terracotta lean-to
              const F = faceInfo(px, pz, w, d, fdir), L = F.along - 2, nA = Math.max(2, Math.round(L / 2.8));
              const stone = new THREE.Color(0xf6efe2), terra = new THREE.Color(pick([0xc8643c, 0xb85a38, 0xd2774a]));
              for (let k = 0; k <= nA; k++) { const u = -L / 2 + (L * k) / nA; const cxp = F.fx + fdir[0] * 2.0 + F.tx * u, czp = F.fz + fdir[1] * 2.0 + F.tz * u;
                B.trim.addGeometry(new THREE.CylinderGeometry(0.18, 0.22, 2.9, 8), mat4(cxp, CURB + 1.45, czp), stone); trimBox(cxp, CURB + 2.95, czp, 0.5, 0.2, 0.5, stone); cyl(cxp, CURB + 1.45, czp, 1.45, 0.2); }
              B.trim.addGeometry(BOXG, mat4(F.fx + fdir[0] * 2.0, CURB + 3.25, F.fz + fdir[1] * 2.0, F.ry, L + 0.6, 0.45, 0.5), stone);
              B.trim.addGeometry(BOXG, new THREE.Matrix4().compose(new THREE.Vector3(F.fx + fdir[0] * 1.15, CURB + 3.75, F.fz + fdir[1] * 1.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, F.ry, 0, 'YXZ')), new THREE.Vector3(L + 1.0, 0.16, 2.6)), terra);
            }
          }
          addBush(px + w / 2 + 1, pz, 1); if (R() < 0.6) addPalm(px - w / 2 - 1.5, pz + d / 2 - 1);
        } else {
          const w = pw - rr(0.5, 2), d = pd - rr(0.5, 2);
          const h = Math.max(10, rr(12, 46) * (type === 'decomid' ? 0.6 : 1) * (r < 220 ? 1.25 : 1));
          const arch = R();
          if (arch < 0.1 && w > 20 && d > 20) garage(px, pz, w, d, 3 + ((R() * 4) | 0));
          else if (arch < 0.2 && w > 16) motel(px, pz, w, d, fdir);
          else if (type === 'decomid' && R() < 0.55) decoBuilding(px, pz, w, d, Math.min(h, 22), fdir);
          else {
            const style = R() < 0.18 ? 'glass' : R() < 0.35 ? 'band' : 'office';
            addBuilding({ cx: px, cz: pz, w, d, h, style, color: style === 'glass' ? pick(GLASS_TINTS) : pick(OFFICE_TINTS), rounded: R() < 0.2 ? 3 : 0 });
            if (!lotRectBlocked(px, pz, w, d)) addLean(px + fdir[0] * (w / 2), pz + fdir[1] * (d / 2), fdir[0], fdir[1], Math.abs(fdir[0]) > 0.5 ? d : w, Math.abs(fdir[0]) > 0.5 ? 0 : 1, Math.abs(fdir[0]) > 0.5 ? 1 : 0);
            if (style !== 'glass' && R() < 0.25 && !lotRectBlocked(px, pz, w, d)) { // apartment block: external stair tower on a side face
              const sd = [fdir[1], -fdir[0]], sgn2 = Math.sign(sd[0] * (cx - px) + sd[1] * (cz - pz)) || 1, sx2 = px + sd[0] * sgn2 * (w / 2 + 1.5), sz2 = pz + sd[1] * sgn2 * (d / 2 + 1.5);
              const stc = new THREE.Color(pick([0xd8cfc0, 0xb8c4c8, 0xe0b89a]));
              trimBox(sx2, CURB + (h + 2.5) / 2, sz2, 3, h + 2.5, 3, stc); box(sx2, CURB + (h + 2.5) / 2, sz2, 1.5, (h + 2.5) / 2, 1.5);
              for (let y = CURB + 2; y < h; y += 3.2) { const ox = sx2 + sd[0] * sgn2 * 1.52, oz = sz2 + sd[1] * sgn2 * 1.52; trimBox(ox, y + 1.0, oz, Math.abs(sd[0]) > 0.5 ? 0.04 : 0.7, 1.6, Math.abs(sd[0]) > 0.5 ? 0.7 : 0.04, 0x2a3a44); }
            }
            if (h < 30 && R() < 0.25) billboardRoof(px, pz, h, w, d);
            else if (h > 16 && R() < 0.2 && !lotRectBlocked(px, pz, w, d)) hotelSign(px, pz, w, d, h, fdir);
            if (!lotRectBlocked(px, pz, w, d)) parcels.push({ i, j, px, pz, w, d, h });
          }
        }
      }
      // alley dumpsters + graffiti on the alley-facing wall
      for (const pc of parcels) {
        if (pc.i >= nx - 1 || R() < 0.4) continue;
        const ax = pc.px + pc.w / 2, gz = pc.pz + rr(-pc.d / 4, pc.d / 4);
        const dx2 = ax + 1.0; if (lotBlocked(dx2, gz, 2)) continue;
        inst.dumpster.push({ x: dx2, y: CURB, z: gz, ry: R() < 0.5 ? 0 : Math.PI, color: pick([0x2e6b3a, 0x2a4f7a, 0x5a5f63, 0x7a3a2a]) }); box(dx2, CURB + 0.65, gz, 0.85, 0.65, 1.1);
        graffiti.push({ x: ax + 0.04, y: rr(1.6, 2.4), z: gz + rr(-3, 3) * (R() < 0.5 ? 1 : -1), ry: Math.PI / 2, s: rr(2.4, 3.6), k: (R() * 8) | 0 });
        if (R() < 0.5) graffiti.push({ x: dx2 + 0.87, y: CURB + 0.75, z: gz, ry: Math.PI / 2, s: 1.4, k: (R() * 8) | 0 });
      }
      return;
    }
  }

  // ---------- billboards ----------
  function boardPanel(x, y, z, ry, ad) {
    inst.board.push({ x, y, z, ry, ad });
  }
  function billboardRoof(px, pz, h, w, d) {
    if (lotRectBlocked(px, pz, w, d)) return;
    const ry = Math.atan2(R() < 0.5 ? 1 : -1, 0) * (R() < 0.5 ? 1 : 0);
    const ad = (R() * ADS.length) | 0;
    trimBox(px - 3, h + 2, pz, 0.3, 4, 0.3, 0x444444, ry); trimBox(px + 3, h + 2, pz, 0.3, 4, 0.3, 0x444444, ry);
    boardPanel(px, h + 4.5, pz, ry, ad);
  }
  function billboardPole(x, z, ry) {
    const ad = (R() * ADS.length) | 0;
    B.trim.addGeometry(CYLG, mat4(x, CURB + 5.5, z, 0, 0.35, 11, 0.35), 0x55595e);
    cyl(x, CURB + 5.5, z, 5.5, 0.35);
    boardPanel(x, CURB + 13.5, z, ry, ad);
  }

  // ---------- road markings ----------
  const MY = 0.012, WHITE = new THREE.Color(0xf4f4f0), YEL = new THREE.Color(0xf2c230);
  function hq(x0, z0, x1, z1, c) { B.marks.hquad(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), MY, c); }
  // vertical roads (along z)
  for (const X of XS) for (let k = 0; k < ZS.length - 1; k++) {
    const a = ZS[k] + HW, b = ZS[k + 1] - HW;
    markSpan('z', X, a, b);
  }
  for (const Z of ZS) for (let k = 0; k < XS.length - 1; k++) markSpan('x', Z, XS[k] + HW, XS[k + 1] - HW);
  function markSpan(ax, C, a, b) {
    { // asphalt repair patches + manholes
      const put = (along, off, sl, sw, arr, extra) => arr.push(ax === 'z' ? { x: C + off, z: along, ry: 0, sx: sw, sy: 1, sz: sl, ...extra } : { x: along, z: C + off, ry: 0, sx: sl, sy: 1, sz: sw, ...extra });
      for (let k = 0; k < 2; k++) if (R() < 0.7) put(rr(a + 8, b - 8), rr(-5, 5), rr(2, 9), rr(1.2, 3.5), inst.patch, { y: 0.009 });
      put(rr(a + 10, b - 10), (R() < 0.5 ? -1 : 1) * (R() < 0.5 ? 1.75 : 5.25), 1, 1, inst.manhole, { y: 0.0, sx: 1, sz: 1 });
    }
    const L = (s0, s1, o0, o1, c) => (ax === 'z' ? hq(C + o0, s0, C + o1, s1, c) : hq(s0, C + o0, s1, C + o1, c));
    const A = a + 5, Bn = b - 5;
    L(A, Bn, -0.28, -0.16, YEL); L(A, Bn, 0.16, 0.28, YEL);
    for (const o of [-3.5, 3.5]) for (let s = A + 1; s < Bn - 3; s += 9) L(s, s + 3, o - 0.07, o + 0.07, WHITE);
    for (const o of [-6.5, 6.5]) L(a + 4, b - 4, o - 0.08, o + 0.08, WHITE);
    // crosswalks (zebra) both ends
    for (const [s0, s1] of [[a + 0.6, a + 3.6], [b - 3.6, b - 0.6]]) for (let o = -6.2; o < 6.3; o += 1.2) L(s0, s1, o, o + 0.6, WHITE);
    // stop lines (right-hand side of each approach)
    // approaching end b (traveling +axis): right side is -offset for z-axis roads (+Z travel: right=-X), +offset... compute generically
    if (ax === 'z') { L(b - 4.3, b - 3.9, -6.6, 0, WHITE); L(a + 3.9, a + 4.3, 0, 6.6, WHITE); }
    else { L(b - 4.3, b - 3.9, 0, 6.6, WHITE); L(a + 3.9, a + 4.3, -6.6, 0, WHITE); }
  }

  // ---------- traffic lights ----------
  for (const X of XS) for (const Z of ZS) {
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      // approach exists?
      if (dz === 1 && Z === ZS[0]) continue; if (dz === -1 && Z === ZS[ZS.length - 1]) continue;
      if (dx === 1 && X === XS[0]) continue; if (dx === -1 && X === XS[XS.length - 1]) continue;
      const rx = -dz, rz = dx; // right vector
      const px = X - dx * 8 + rx * 8, pz = Z - dz * 8 + rz * 8;
      inst.tlMast.push({ x: px, y: CURB, z: pz, ry: Math.atan2(rz, -rx) });
      cyl(px, CURB + 3.2, pz, 3.2, 0.16);
      const fr = Math.atan2(-dx, -dz);
      // street-name blade sign on the mast arm, naming the cross street, facing the approaching driver
      { const sx3 = px - rx * 1.7, sz3 = pz - rz * 1.7; const nameIdx = dz !== 0 ? 10 + ZS.indexOf(Z) : XS.indexOf(X);
        inst.streetSign.push({ x: sx3 + Math.sin(fr) * 0.1, y: CURB + 6.75, z: sz3 + Math.cos(fr) * 0.1, ry: fr, k: nameIdx }); }
      for (const k of [3.2, 6.2]) {
        const hx = px - rx * k, hz = pz - rz * k;
        inst.tlHead.push({ x: hx, y: CURB + 5.6, z: hz, ry: fr, axis: dz !== 0 ? 'z' : 'x' });
      }
    }
  }

  // ---------- beach props ----------
  {
    // boardwalk
    const bwX0 = 446, bwX1 = 452;
    B.wood.addGeometryWorldUV(BOXG, mat4((bwX0 + bwX1) / 2, 0.11, 0, 0, bwX1 - bwX0, 0.22, 900), new THREE.Color(0xffffff), 1 / 3);
    box((bwX0 + bwX1) / 2, 0.11, 0, (bwX1 - bwX0) / 2, 0.11, 450);
    for (let z0 = -440; z0 < 440; z0 += 40) {
      // 36m rail sections with 4m openings; extra openings at the pier ramp and the beach shop lot
      let a0 = z0, a1 = Math.min(440, z0 + 36);
      for (const [g0, g1] of [[PIER_Z - 7, PIER_Z + 7], [-52, -28]]) { if (a1 > g0 && a0 < g1) { if (a0 < g0) a1 = g0; else a0 = g1; } }
      if (a1 - a0 < 2) continue;
      for (let z = a0; z <= a1 + 0.01; z += 6) trimBox(bwX1 + 0.05, 0.6, Math.min(z, a1), 0.12, 0.9, 0.12, 0xe8dcc8);
      trimBox(bwX1 + 0.05, 1.0, (a0 + a1) / 2, 0.1, 0.08, a1 - a0, 0xf3ead8);
      box(bwX1 + 0.05, 0.6, (a0 + a1) / 2, 0.08, 0.6, (a1 - a0) / 2);
    }
    for (let z = -400; z <= 400; z += 20) {
      sidewalkSegs.push({ x0: 449, z0: z, x1: 449, z1: z + 18, len: 18 });
    }
    // lifeguard towers
    const tc = [0xff6b9a, 0x4ad8d0, 0xffc93c, 0xa47cff, 0xff8a3d];
    let ti = 0;
    for (let z = -420; z <= 420; z += 105) {
      const x = 492, c = tc[ti++ % tc.length];
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { trimBox(x + ox * 1.1, 1.1, z + oz * 1.1, 0.18, 2.2, 0.18, 0xf2f2f2); box(x + ox * 1.1, 1.1, z + oz * 1.1, 0.1, 1.1, 0.1); }
      trimBox(x, 2.35, z, 3.0, 0.15, 3.0, 0xf2f2f2);
      trimBox(x, 3.5, z, 2.6, 2.1, 2.6, c);
      trimBox(x + 1.32, 3.7, z, 0.04, 0.9, 2.1, 0x2a4a5a);
      B.trim.addGeometry(BOXG, tmpM.compose(tmpP.set(x, 4.75, z), tmpQ.setFromEuler(tmpE.set(0, 0, 0.12)), tmpS.set(3.4, 0.18, 3.4)), 0xffffff);
      B.trim.addGeometry(BOXG, tmpM.compose(tmpP.set(x - 3.2, 1.2, z), tmpQ.setFromEuler(tmpE.set(0, 0, -0.55)), tmpS.set(4.6, 0.12, 1.1)), 0xe8dcc8);
      trimBox(x + 0.4, 5.6, z, 0.06, 1.8, 0.06, 0xdddddd);
      col.set(c); B.neon.addGeometry(BOXG, mat4(x + 0.7, 6.2, z, 0, 0.9, 0.55, 0.03), col);
      box(x, 3.0, z, 1.5, 1.8, 1.5);
      // tower detail: platform railing, flag, rescue buoy, number board
      for (const [ox, oz, lw2, ld2] of [[1.45, 0, 0.06, 3.0], [0, 1.45, 3.0, 0.06], [0, -1.45, 3.0, 0.06]]) trimBox(x + ox, 3.4, z + oz, lw2, 0.07, ld2, 0xffffff);
      for (const [ox, oz] of [[1.45, 1.45], [1.45, -1.45], [-1.45, 1.45], [-1.45, -1.45]]) trimBox(x + ox, 2.9, z + oz, 0.07, 1.0, 0.07, 0xffffff);
      trimBox(x - 1.4, 4.2, z + 1.4, 0.07, 8.4, 0.07, 0xdddddd);
      trimBox(x - 1.4, 7.95, z + 1.4 + 0.5, 0.02, 0.35, 0.9, 0xe53935); trimBox(x - 1.4, 7.6, z + 1.4 + 0.5, 0.02, 0.35, 0.9, 0xffd23f);
      B.trim.addGeometry(new THREE.TorusGeometry(0.38, 0.1, 6, 14), mat4(x, 3.4, z + 1.33), new THREE.Color(0xff6a00));
      trimBox(x + 1.33, 4.4, z, 0.04, 0.4, 0.8, 0xffffff);
      if (Math.abs(z) <= 105) continue;
      // umbrellas & towels around
      for (let k = 0; k < 9; k++) {
        const ux = rr(462, 500), uz = z + rr(-45, 45);
        if ((Math.abs(ux - x) < 5 && Math.abs(uz - z) < 5) || Math.abs(uz - PIER_Z) < 9 || lotBlocked(ux, uz, 3)) continue;
        inst.umbrella.push({ x: ux, y: 0, z: uz, ry: R() * 6, color: pick([0xff5d8f, 0x2ec4b6, 0xffb703, 0xffffff, 0x7b61ff, 0xff7a1a]) });
        trimBox(ux + rr(-1.2, 1.2), 0.03, uz + 1.6, 0.9, 0.03, 1.9, pick(PASTELS), rr(-0.3, 0.3));
      }
    }
    // ===== beach life near spawn =====
    const TIKI = { x: 478, z: 30 }, COURT = { x: 482, z: 70 };
    const UCOL = [0xff5d8f, 0x2ec4b6, 0xffb703, 0xffffff, 0x7b61ff, 0xff7a1a, 0xe63946, 0x06d6a0, 0x118ab2];
    const TCOL = [0xff9eb8, 0x7fe3d0, 0xffe08a, 0xbfa6ff, 0xffbf80, 0xffffff, 0x80d4ff, 0xff5d8f, 0xffb703];
    for (const rx of [477, 484, 491]) for (let z = -165; z <= 104; z += 7) {
      if (Math.abs(z - TIKI.z) < 13 || Math.abs(z - COURT.z) < 14) continue;
      if (rx > 486 && (Math.abs(z) < 7 || Math.abs(z + 105) < 7)) continue;
      if (lotBlocked(rx, z, 3)) continue;
      const uc = pick(UCOL);
      inst.umbrella.push({ x: rx, y: 0, z, ry: R() * 6, color: uc });
      for (const o of [-1.0, 1.0]) if (R() < 0.85) { const lry = Math.PI / 2 + rr(-0.08, 0.08); inst.bLounger.push({ x: rx + 0.3, y: 0.02, z: z + o, ry: lry, color: pick(TCOL) }); box(rx + 0.3, 0.3, z + o, 0.35, 0.3, 0.85, lry); }
      if (R() < 0.5) trimBox(rx - 2.2, 0.025, z + rr(-1, 1), 1.0, 0.02, 1.9, pick(TCOL), rr(-0.4, 0.4));
    }
    // volleyball court
    {
      const { x, z } = COURT;
      for (const [x0, z0, x1, z1] of [[x - 4, z - 8, x + 4, z - 7.94], [x - 4, z + 7.94, x + 4, z + 8], [x - 4, z - 8, x - 3.94, z + 8], [x + 3.94, z - 8, x + 4, z + 8]]) B.marks.hquad(x0, z0, x1, z1, 0.04, 0xffffff);
      for (const sx of [-1, 1]) { trimBox(x + sx * 4.6, 1.3, z, 0.1, 2.6, 0.1, 0xf2f2f2); cyl(x + sx * 4.6, 1.3, z, 1.3, 0.08); }
      trimBox(x, 2.43, z, 9.1, 0.07, 0.03, 0xffffff); trimBox(x, 1.57, z, 9.1, 0.03, 0.03, 0xffffff);
      const nc = document.createElement('canvas'); nc.width = nc.height = 64; const nx2 = nc.getContext('2d'); nx2.strokeStyle = '#111'; nx2.lineWidth = 3;
      for (let i = 0; i <= 64; i += 8) { nx2.beginPath(); nx2.moveTo(i, 0); nx2.lineTo(i, 64); nx2.moveTo(0, i); nx2.lineTo(64, i); nx2.stroke(); }
      const nt = new THREE.CanvasTexture(nc); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(18, 2);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(9.1, 0.86), new THREE.MeshStandardMaterial({ map: nt, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, roughness: 0.9 }));
      net.position.set(x, 2.0, z); root.add(net);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff3c4, roughness: 0.6 })); ball.position.set(x - 1.5, 0.13, z - 4); ball.castShadow = true; root.add(ball);
    }
    // surfboard racks by the boardwalk
    for (const rz of [-8, -66, 52]) {
      const rx = 455.6;
      for (const o of [-2.1, 2.1]) trimBox(rx, 0.7, rz + o, 0.12, 1.4, 0.12, 0x8b5a2b);
      trimBox(rx, 1.3, rz, 0.1, 0.1, 4.4, 0x8b5a2b); trimBox(rx, 0.35, rz, 0.1, 0.08, 4.4, 0x8b5a2b);
      box(rx - 0.3, 1.0, rz, 0.6, 1.0, 2.25);
      for (let k = 0; k < 5; k++) inst.board2.push({ x: rx - 0.42, y: 0.02, z: rz - 1.6 + k * 0.8, ry: rr(-0.08, 0.08), color: pick([0xff5d8f, 0x2ec4b6, 0xffb703, 0xffffff, 0x118ab2, 0xef476f, 0x06d6a0, 0xffd6a5]) });
    }
    // tiki beach bar with string lights
    {
      const { x, z } = TIKI, W = 5, D = 7;
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { B.trim.addGeometry(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 8), mat4(x + ox * W / 2, 1.6, z + oz * D / 2), new THREE.Color(0xb08850)); cyl(x + ox * W / 2, 1.6, z + oz * D / 2, 1.6, 0.14); }
      const rg = new THREE.ConeGeometry(1, 1, 4, 1); rg.rotateY(Math.PI / 4);
      B.trim.addGeometry(rg, mat4(x, 3.2 + 1.1, z, 0, (W + 1.8) * 0.7072, 2.2, (D + 1.8) * 0.7072), new THREE.Color(0xc9a55a));
      trimBox(x, 3.15, z, W + 1.8, 0.12, D + 1.8, 0xa8843e);
      trimBox(x - W / 2 + 0.4, 0.55, z, 0.7, 1.1, D - 0.6, 0x8b5a2b); trimBox(x - W / 2 + 0.3, 1.13, z, 0.95, 0.07, D - 0.4, 0xd9b07a);
      box(x - W / 2 + 0.4, 0.55, z, 0.35, 0.55, D / 2 - 0.3);
      trimBox(x + W / 2 - 0.4, 1.0, z, 0.4, 2.0, D - 1, 0x6b4423);
      for (let k = 0; k < 5; k++) { inst.stool.push({ x: x - W / 2 - 0.6, y: 0.02, z: z - 2.4 + k * 1.2 }); cyl(x - W / 2 - 0.6, 0.42, z - 2.4 + k * 1.2, 0.4, 0.22); }
      for (let k = 0; k < 3; k++) { const cry = R() * 3; inst.cafe.push({ x: x - 7.5, y: 0.02, z: z - 4 + k * 4, ry: cry }); box(x - 7.5, 0.45, z - 4 + k * 4, 1.2, 0.45, 0.3, cry); }
      const sc = document.createElement('canvas'); sc.width = 512; sc.height = 128; const sx2 = sc.getContext('2d');
      sx2.fillStyle = '#2a1608'; sx2.fillRect(0, 0, 512, 128); sx2.font = 'bold 76px "Arial Black", Impact, sans-serif'; sx2.textAlign = 'center'; sx2.textBaseline = 'middle';
      sx2.shadowColor = '#ffb703'; sx2.shadowBlur = 20; sx2.fillStyle = '#ffd86b'; sx2.fillText('TIKI SOL', 256, 68);
      const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
      M.tikiSign = new THREE.MeshBasicMaterial({ map: st, toneMapped: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), M.tikiSign); sign.position.set(x - W / 2 - 0.95, 3.0, z); sign.rotation.y = -Math.PI / 2; root.add(sign);
      const poles = [[x - 10, z - 6.5], [x - 10, z + 6.5]];
      for (const [px, pz] of poles) { trimBox(px, 1.75, pz, 0.14, 3.5, 0.14, 0x8b5a2b); cyl(px, 1.75, pz, 1.75, 0.1); }
      const corners = [[x - W / 2 - 0.9, z - D / 2 - 0.9], [x - W / 2 - 0.9, z + D / 2 + 0.9]];
      const strand = (a, b, ya, yb, sag) => { const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]); const n2 = Math.max(4, Math.round(L2 / 0.55));
        for (let i = 0; i <= n2; i++) { const t = i / n2; inst.bulb.push({ x: a[0] + (b[0] - a[0]) * t, y: ya + (yb - ya) * t - sag * 4 * t * (1 - t), z: a[1] + (b[1] - a[1]) * t }); } };
      strand(poles[0], poles[1], 3.4, 3.4, 0.5); strand(poles[0], corners[0], 3.4, 3.1, 0.35); strand(poles[1], corners[1], 3.4, 3.1, 0.35);
      strand(poles[0], corners[1], 3.4, 3.1, 0.6); strand(poles[1], corners[0], 3.4, 3.1, 0.6); strand(corners[0], corners[1], 3.1, 3.1, 0.25);
      strand([x + W / 2 + 0.9, z - D / 2 - 0.9], [x + W / 2 + 0.9, z + D / 2 + 0.9], 3.1, 3.1, 0.25);
    }
    // parked scooters & bicycles along the promenade (kept clear of spawn & street furniture)
    for (const cz0 of [-150, -128, -100, -78, -62, 8, 30, 64, 88]) {
      const nV = 3 + ((R() * 3) | 0);
      for (let k = 0; k < nV; k++) {
        const vx = 431.0, vz = cz0 + k * 1.0;
        const near = (arr) => arr.some((o) => Math.abs((o.x ?? o[0]) - vx) < 2.2 && Math.abs((o.z ?? o[1]) - vz) < 2.2);
        if (near(planterPos) || near(inst.news) || near(inst.bench) || lotBlocked(vx, vz, 2)) continue;
        const kind = R() < 0.5 ? 0 : 1, ry = -Math.PI / 2 + rr(-0.15, 0.15);
        inst.twoWheel[kind].push({ x: vx, y: CURB, z: vz, ry, color: kind ? pick([0xff9eb8, 0x7fe3d0, 0xffe08a, 0xffffff, 0xe63946, 0x80d4ff]) : pick([0x222222, 0x1e88e5, 0xe53935, 0x43a047, 0xffb300, 0xffffff]) });
        box(vx, CURB + 0.5, vz, 0.25, 0.5, 0.85, ry);
      }
    }
    // beach palms clusters
    for (let z = -470; z <= 470; z += rr(18, 30)) { if (Math.abs(z - PIER_Z) < 10) continue; { const bx = rr(456, 470); if (addPalm(bx, z, 0.02, rr(0.9, 1.3)) && bx < 466) inst.uplight.push({ x: bx - 0.7, y: 0.02, z }); } if (R() < 0.4) addPalm(rr(456, 470), z + 5, 0.02, rr(0.8, 1.1)); }
    // beach pole billboards
    billboardPole(430, -200, Math.PI / 2 + 0.3); billboardPole(430, 160, Math.PI / 2 - 0.3);
  }


  const merge = (parts) => { const b = new Batch(); for (const [g, m, c] of parts) b.addGeometry(g, m, c ?? 0xffffff); const mesh = b.build(null); return mesh.geometry; };
  // ---------- Southline Pier + Ferris wheel + boats ----------
  const pierWheel = new THREE.Group();
  const boats = [];
  {
    const rampX1 = PIER_X0 + 16, rampLen = rampX1 - PIER_X0;
    // deck
    B.wood.addGeometryWorldUV(BOXG, mat4((rampX1 + PIER_X1) / 2, PIER_Y - 0.15, PIER_Z, 0, PIER_X1 - rampX1, 0.3, PIER_HW * 2), new THREE.Color(0xffffff), 1 / 3);
    box((rampX1 + PIER_X1) / 2, PIER_Y - 0.15, PIER_Z, (PIER_X1 - rampX1) / 2, 0.15, PIER_HW);
    // ramp
    const ra = Math.atan2(PIER_Y - 0.22, rampLen), rl = Math.hypot(rampLen, PIER_Y - 0.22);
    const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ra));
    B.wood.addGeometryWorldUV(BOXG, new THREE.Matrix4().compose(new THREE.Vector3(PIER_X0 + rampLen / 2, (PIER_Y + 0.22) / 2 - 0.15, PIER_Z), rq, new THREE.Vector3(rl + 0.2, 0.3, PIER_HW * 2)), new THREE.Color(0xffffff), 1 / 3);
    world.createCollider(RAPIER.ColliderDesc.cuboid(rl / 2 + 0.1, 0.15, PIER_HW).setTranslation(PIER_X0 + rampLen / 2, (PIER_Y + 0.22) / 2 - 0.15, PIER_Z).setRotation({ x: rq.x, y: rq.y, z: rq.z, w: rq.w }));
    // posts & rails
    for (let x = rampX1; x <= PIER_X1; x += 6) for (const sz of [-1, 1]) inst.pierPost.push({ x, y: -5, z: PIER_Z + sz * (PIER_HW - 0.3) });
    for (const sz of [-1, 1]) {
      const z = PIER_Z + sz * (PIER_HW - 0.1);
      trimBox((rampX1 + PIER_X1) / 2, PIER_Y + 1.0, z, PIER_X1 - rampX1, 0.1, 0.12, 0xf6f1e6);
      trimBox((rampX1 + PIER_X1) / 2, PIER_Y + 0.55, z, PIER_X1 - rampX1, 0.06, 0.06, 0xf6f1e6);
      box((rampX1 + PIER_X1) / 2, PIER_Y + 0.6, z, (PIER_X1 - rampX1) / 2, 0.6, 0.08);
      for (let x = rampX1; x <= PIER_X1; x += 3) trimBox(x, PIER_Y + 0.5, z, 0.1, 1.0, 0.1, 0xf6f1e6);
      for (let x = rampX1 + 10; x < PIER_X1 - 30; x += 24) {
        inst.lamp.push({ x, y: PIER_Y, z: z - sz * 0.3, ry: sz > 0 ? Math.PI : 0, s: 0.7 }); cyl(x, PIER_Y + 2.6, z - sz * 0.3, 2.6, 0.1);
        inst.pool.push({ x, y: PIER_Y + 0.02, z: z - sz * 2.0 });
        if ((x / 24) % 2 < 1) addBench(x + 6, z - sz * 0.8, sz > 0 ? 0 : Math.PI, PIER_Y);
      }
    }
    box(PIER_X1, PIER_Y + 0.6, PIER_Z, 0.1, 0.6, PIER_HW);
    trimBox(PIER_X1, PIER_Y + 1.0, PIER_Z, 0.12, 0.1, PIER_HW * 2, 0xf6f1e6);
    // entrance arch with neon sign
    for (const sz of [-1, 1]) { trimBox(PIER_X0 - 1, 3.2, PIER_Z + sz * (PIER_HW + 0.4), 0.9, 6.4, 0.9, 0xfff0f5); box(PIER_X0 - 1, 3.2, PIER_Z + sz * (PIER_HW + 0.4), 0.45, 3.2, 0.45); }
    trimBox(PIER_X0 - 1, 6.9, PIER_Z, 1.0, 1.6, PIER_HW * 2 + 2.6, 0x2ec4b6);
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 128; const sx = sc.getContext('2d');
    sx.fillStyle = '#05121a'; sx.fillRect(0, 0, 1024, 128);
    sx.font = 'bold 92px "Arial Black", Impact, sans-serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle';
    sx.shadowColor = '#ff3fd2'; sx.shadowBlur = 24; sx.fillStyle = '#ff7ae6'; sx.fillText('SOUTHLINE  PIER', 512, 68);
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshBasicMaterial({ map: st, toneMapped: false });
    signMat.userData.neon = true; M.pierSign = signMat;
    for (const sgn of [-1, 1]) {
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(PIER_HW * 2 + 2, 1.3), signMat);
      sp.position.set(PIER_X0 - 1 + sgn * 0.52, 6.9, PIER_Z); sp.rotation.y = sgn * Math.PI / 2; root.add(sp);
    }
    // Ferris wheel
    const WX = PIER_X1 - 22, WR = 20, WY = PIER_Y + WR + 3;
    for (const sx2 of [-1, 1]) for (const sz of [-1, 1]) {
      const fx = WX + sx2 * 3.2, fz = PIER_Z + sz * 4.4, H = WY - PIER_Y;
      const len = Math.hypot(4.4, H), phi = Math.atan2(-4.4 * sz, H);
      B.trim.addGeometry(BOXG, new THREE.Matrix4().compose(new THREE.Vector3(fx, (PIER_Y + WY) / 2, (fz + PIER_Z) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(phi, 0, 0)), new THREE.Vector3(0.6, len, 0.6)), new THREE.Color(0xf4f4f4));
      box(fx, PIER_Y + 2, fz, 0.5, 2, 0.5);
    }
    B.trim.addGeometry(new THREE.CylinderGeometry(0.9, 0.9, 7, 12), new THREE.Matrix4().compose(new THREE.Vector3(WX, WY, PIER_Z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(1, 1, 1)), new THREE.Color(0xdddddd));
    pierWheel.position.set(WX, WY, PIER_Z);
    const wb = new Batch(), wn = new Batch();
    const rimG = new THREE.TorusGeometry(WR, 0.32, 6, 72);
    for (const dz of [-1.6, 1.6]) {
      wb.addGeometry(rimG, mat4(0, 0, dz), 0xf7f7f7);
      wn.addGeometry(new THREE.TorusGeometry(WR + 0.38, 0.09, 4, 96), mat4(0, 0, dz), 0xff3fd2);
      wn.addGeometry(new THREE.TorusGeometry(WR * 0.55, 0.08, 4, 64), mat4(0, 0, dz), 0x23f0ff);
    }
    const NS = 24;
    for (let i = 0; i < NS; i++) {
      const a = (i / NS) * Math.PI * 2;
      for (const dz of [-1.6, 1.6]) {
        wb.addGeometry(BOXG, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * WR / 2, Math.sin(a) * WR / 2, dz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)), new THREE.Vector3(WR, 0.14, 0.14)), 0xf0f0f0);
      }
      wn.addGeometry(BOXG, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * WR / 2, Math.sin(a) * WR / 2, 1.75), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)), new THREE.Vector3(WR, 0.06, 0.06)), i % 2 ? 0xffd23f : 0x23f0ff);
      wb.addGeometry(BOXG, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * WR, Math.sin(a) * WR, 0), new THREE.Quaternion(), new THREE.Vector3(0.18, 0.18, 3.4)), 0xe0e0e0);
    }
    const wheelMesh = wb.build(M.trim); wheelMesh.matrixAutoUpdate = true;
    const wheelNeon = wn.build(M.neon, { cast: false }); wheelNeon.matrixAutoUpdate = true;
    // wheel lies in the x-y plane; rotate so its face points west toward the beach
    const spin = new THREE.Group(); spin.add(wheelMesh, wheelNeon);
    pierWheel.add(spin); pierWheel.rotation.y = Math.PI / 2; root.add(pierWheel);
    // gondolas (kept upright)
    const gG = merge([[BOXG, mat4(0, -1.3, 0, 0, 2.0, 1.6, 2.0), 0xffffff], [BOXG, mat4(0, -0.35, 0, 0, 2.3, 0.2, 2.3), 0xff5d8f], [BOXG, mat4(0, -0.25, 0, 0, 0.1, 0.5, 0.1), 0x999999]]);
    const gondola = new THREE.InstancedMesh(gG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), NS);
    const gc = [0xff9eb8, 0x7fe3d0, 0xffe08a, 0xbfa6ff, 0x80d4ff, 0xffbf80];
    for (let i = 0; i < NS; i++) gondola.setColorAt(i, col.set(gc[i % gc.length]));
    gondola.castShadow = true; gondola.frustumCulled = false; root.add(gondola);
    pierWheel.userData = { spin, gondola, NS, WR, WX, WY };
    // boats
    const hull = new THREE.BoxGeometry(2.6, 1.1, 8, 1, 1, 4); const HP = hull.attributes.position;
    for (let i = 0; i < HP.count; i++) { const z = HP.getZ(i), y = HP.getY(i); const k = Math.max(0, z / 4); HP.setX(i, HP.getX(i) * (1 - 0.92 * k * k) * (y < 0 ? 0.75 : 1)); if (y > 0) HP.setY(i, y + k * 0.35); }
    hull.computeVertexNormals();
    const boatG = merge([[hull, mat4(0, 0.25, 0), 0xffffff], [BOXG, mat4(0, 1.15, -1.0, 0, 1.9, 0.9, 2.6), 0xf2f2f2], [BOXG, mat4(0, 1.3, 0.35, 0, 1.7, 0.6, 0.08), 0x2a4a5a], [BOXG, mat4(0, 0.55, 0, 0, 2.62, 0.18, 7.0), 0x1f6f9f]]);
    const boatMesh = new THREE.InstancedMesh(boatG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 }), 10);
    for (let i = 0; i < 10; i++) boats.push({ x: rr(565, 760), z: PIER_Z + (i % 2 ? 1 : -1) * rr(25, 260), ry: R() * 6, ph: R() * 6, s: rr(0.9, 1.6) });
    boatMesh.castShadow = true; boatMesh.frustumCulled = false; root.add(boatMesh);
    pierWheel.userData.boatMesh = boatMesh;
    sidewalkSegs.push({ x0: rampX1 + 2, z0: PIER_Z, x1: PIER_X1 - 40, z1: PIER_Z, len: 60, y: PIER_Y });
  }

  for (const u of inst.umbrella) cyl(u.x, (u.y || 0) + 1.2, u.z, 1.2, 0.07);
  // ---------- city-limit hedge + tree line ----------
  {
    const hedgeC = new THREE.Color(0x3f6e2e);
    trimBox(-503, 1.6, 0, 3, 3.2, 1006, hedgeC);
    trimBox((-506 + BEACH_X0) / 2, 1.6, -503, BEACH_X0 + 506, 3.2, 3, hedgeC);
    trimBox((-506 + BEACH_X0) / 2, 1.6, 503, BEACH_X0 + 506, 3.2, 3, hedgeC);
    for (let t = -495; t < 495; t += rr(9, 15)) addPalm(-509 - R() * 6, t, 0, rr(1, 1.4));
    for (let t = -495; t < BEACH_X0 - 5; t += rr(9, 15)) { addPalm(t, -509 - R() * 6, 0, rr(1, 1.4)); addPalm(t, 509 + R() * 6, 0, rr(1, 1.4)); }
  }
  // ---------- far skyline (off-map): neighbouring districts, cranes, causeway, ships ----------
  {
    const FR = rng(9090), fr = (a, b) => a + FR() * (b - a), fpick = (a) => a[(FR() * a.length) | 0];
    const tex = { glass: [glass, 16, 16], office: [office, 8, 8], band: [bandTex, 16, 8], deco: [deco, 4, 4] };
    const wall = (style, pts, y0, y1, color) => { const [f, bays, fl] = tex[style]; wallStrip(B[style], pts, y0, y1, f.tileW, f.tileH, new THREE.Color(color), ((FR() * bays) | 0) / bays, ((FR() * fl) | 0) / fl); };
    const farB = (x, z, w, d, h, style) => {
      const color = style === 'glass' ? fpick(GLASS_TINTS) : style === 'deco' ? fpick(PASTELS) : fpick(OFFICE_TINTS);
      const roofC = new THREE.Color(style === 'glass' ? 0x6c7278 : 0xbab4aa);
      const k = FR();
      let top = h, tw = w, td = d;
      if (k < 0.2 && h > 50) { const pts = roundRectPts(x, z, w, d, Math.min(w, d) * 0.45, 5); wall(style, pts, 0, h, color); capPoly(B.roof, pts, h, roofC); }
      else if (k < 0.55 && h > 40) {
        const h1 = h * fr(0.5, 0.7), h2 = h * fr(0.8, 0.9);
        wall(style, rectPts(x, z, w, d), 0, h1, color); capPoly(B.roof, rectPts(x, z, w, d), h1, roofC);
        wall(style, rectPts(x, z, w * 0.75, d * 0.75), h1, h2, color); capPoly(B.roof, rectPts(x, z, w * 0.75, d * 0.75), h2, roofC);
        wall(style, rectPts(x, z, w * 0.5, d * 0.5), h2, h, color); tw = w * 0.5; td = d * 0.5; capPoly(B.roof, rectPts(x, z, tw, td), h, roofC);
      } else { wall(style, rectPts(x, z, w, d), 0, h, color); capPoly(B.roof, rectPts(x, z, w, d), h, roofC); }
      if (h > 60 && FR() < 0.5) { col.set(fpick(NEONS)); wallStrip(B.neon, rectPts(x, z, tw + 0.6, td + 0.6), top - 2, top - 1.2, 10, 10, col); }
      if (h > 90) { if (FR() < 0.6) { const sh = fr(15, 40); B.trim.addGeometry(new THREE.CylinderGeometry(0.4, 1.4, sh, 6), mat4(x, top + sh / 2, z), new THREE.Color(0xd0d6dc)); top += sh; } inst.beacon.push({ x, y: top + 0.5, z, s: 3.5 }); }
      else if (FR() < 0.4) inst.beacon.push({ x: x + tw / 2 - 1, y: top + 1, z: z + td / 2 - 1, s: 2.5 });
    };
    const district = (x0, x1, z0, z1, cx, cz, peak, base, skip) => {
      for (let x = x0; x < x1; x += fr(45, 70)) for (let z = z0; z < z1; z += fr(45, 70)) {
        if (FR() < skip) continue;
        const dd = Math.hypot(x - cx, z - cz), f = Math.max(0, 1 - dd / 520);
        const h = base * fr(0.5, 1.4) + peak * Math.pow(f, 1.6) * fr(0.55, 1.1);
        const style = h > 70 ? (FR() < 0.65 ? 'glass' : 'band') : FR() < 0.35 ? 'deco' : 'office';
        farB(x + fr(-8, 8), z + fr(-8, 8), fr(18, 40), fr(18, 40), Math.max(8, h), style);
      }
    };
    district(-420, 470, 600, 1250, 60, 930, 230, 22, 0.25);     // north: second downtown
    district(-420, 470, -1250, -600, 330, -820, 150, 18, 0.3);  // south: coastal condos
    district(-1150, -600, -700, 700, -900, 150, 120, 16, 0.35); // inland west
    // coastal condo row facing the sea (slender towers)
    for (const zs of [1, -1]) for (let z = 640; z < 1150; z += fr(55, 80)) farB(fr(455, 480), zs * z, fr(16, 22), fr(26, 34), fr(70, 160), FR() < 0.5 ? 'glass' : 'deco');
    // tower cranes at construction sites
    for (const [cx2, cz2, ch] of [[-80, 760, 120], [250, -900, 95], [-850, -300, 80], [120, 1080, 140]]) {
      const yel = new THREE.Color(0xf2b705);
      B.trim.addGeometry(BOXG, mat4(cx2, ch / 2, cz2, 0, 2.2, ch, 2.2), yel);
      B.trim.addGeometry(BOXG, mat4(cx2 + 22, ch + 1, cz2, 0, 62, 1.6, 1.6), yel);
      B.trim.addGeometry(BOXG, mat4(cx2 - 14, ch - 0.5, cz2, 0, 10, 3.5, 3), new THREE.Color(0x666666));
      B.trim.addGeometry(BOXG, mat4(cx2, ch + 6, cz2, 0, 1.2, 12, 1.2), yel);
      B.trim.addGeometry(BOXG, mat4(cx2 + 40, ch - 14, cz2, 0, 0.15, 28, 0.15), new THREE.Color(0x333333));
      inst.beacon.push({ x: cx2, y: ch + 12.5, z: cz2, s: 3 }); inst.beacon.push({ x: cx2 + 52, y: ch + 2, z: cz2, s: 2.5 });
    }
    // causeway bridge with cable-stayed pylon, heading out across the bay to the north-east
    {
      const A = new THREE.Vector3(470, 0, 760), Bv = new THREE.Vector3(2900, 0, 1700);
      const dir = Bv.clone().sub(A), L = dir.length(); dir.normalize();
      const yaw = Math.atan2(dir.x, dir.z), side = new THREE.Vector3(dir.z, 0, -dir.x);
      const deckY = (t) => 3 + 32 * Math.sin(Math.PI * Math.min(1, t / 0.6)) ** 0.7 * (t < 0.6 ? 1 : 1) - (t > 0.6 ? 20 * (t - 0.6) / 0.4 : 0);
      const n = 70, gray = new THREE.Color(0xb8b8b0);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, p0 = A.clone().addScaledVector(dir, L * t0), p1 = A.clone().addScaledVector(dir, L * t1);
        const y0 = deckY(t0), y1 = deckY(t1), mid = p0.clone().add(p1).multiplyScalar(0.5), seg = L / n;
        const pitch = Math.atan2(y1 - y0, seg);
        B.trim.addGeometry(BOXG, new THREE.Matrix4().compose(new THREE.Vector3(mid.x, (y0 + y1) / 2, mid.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')), new THREE.Vector3(18, 1.6, seg + 0.5)), gray);
        if (i % 2 === 0) B.trim.addGeometry(BOXG, mat4(p0.x, (y0 - 12) / 2, p0.z, yaw, 6, y0 + 12, 3), gray);
        for (const sg of [-1, 1]) inst.bulb.push({ x: p0.x + side.x * 8.5 * sg, y: y0 + 7, z: p0.z + side.z * 8.5 * sg, s: 9 });
      }
      const tp = 0.3, pp = A.clone().addScaledVector(dir, L * tp), py = deckY(tp), PH = 120;
      for (const sg of [-1, 1]) B.trim.addGeometry(BOXG, mat4(pp.x + side.x * 10 * sg, PH / 2, pp.z + side.z * 10 * sg, yaw, 4, PH, 6), new THREE.Color(0xe8e8e4));
      inst.beacon.push({ x: pp.x, y: PH + 2, z: pp.z, s: 4 });
      for (let k = 1; k <= 8; k++) for (const fwd of [-1, 1]) {
        const tq = tp + fwd * k * 0.018, q = A.clone().addScaledVector(dir, L * tq), qy = deckY(tq);
        const top = new THREE.Vector3(pp.x, PH - 6 - k * 2, pp.z), bot = new THREE.Vector3(q.x, qy + 1, q.z), m = top.clone().add(bot).multiplyScalar(0.5), dv = bot.clone().sub(top);
        B.trim.addGeometry(BOXG, new THREE.Matrix4().compose(m, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.clone().normalize()), new THREE.Vector3(0.35, dv.length(), 0.35)), new THREE.Color(0xf4f4f4));
      }
    }
    // ships: one cruise liner and two cargo ships out at sea
    const ship = (x, z, yaw, kind) => {
      const fw = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), sd = new THREE.Vector3(fw.z, 0, -fw.x);
      const at = (f, s2, y) => new THREE.Vector3(x + fw.x * f + sd.x * s2, y, z + fw.z * f + sd.z * s2);
      if (kind === 'cruise') {
        const hull = at(0, 0, 4); B.trim.addGeometry(BOXG, mat4(hull.x, hull.y, hull.z, yaw, 36, 14, 260), new THREE.Color(0x1d3557));
        const up = at(0, 0, 13); B.trim.addGeometry(BOXG, mat4(up.x, up.y, up.z, yaw, 36.2, 4, 262), new THREE.Color(0xf6f6f6));
        for (let tier = 0; tier < 5; tier++) { const w2 = 32 - tier * 2.5, l2 = 220 - tier * 22, c = at(-10 - tier * 4, 0, 15 + tier * 3.4); wall('deco', rectPts(0, 0, w2, l2).map(([a, b]) => [c.x + sd.x * a + fw.x * b, c.z + sd.z * a + fw.z * b]), 15 + tier * 3.4 - 1.7 + 0.01, 15 + tier * 3.4 + 1.7, 0xffffff); }
        const fn = at(-70, 0, 38); B.trim.addGeometry(BOXG, mat4(fn.x, fn.y, fn.z, yaw, 8, 10, 14), new THREE.Color(0xd62828));
        inst.beacon.push({ x: fn.x, y: 44, z: fn.z, s: 3 });
      } else {
        const hull = at(0, 0, 3); B.trim.addGeometry(BOXG, mat4(hull.x, hull.y, hull.z, yaw, 30, 10, 220), new THREE.Color(fpick([0x7a1f1f, 0x1f3a5f, 0x2d4a2d])));
        const br = at(-95, 0, 18); B.trim.addGeometry(BOXG, mat4(br.x, br.y, br.z, yaw, 26, 20, 14), new THREE.Color(0xf2f2f2));
        for (let f = -80; f < 95; f += 13) for (let s2 = -11; s2 <= 11; s2 += 5.5) {
          const hgt = 1 + ((FR() * 4) | 0), c = at(f, s2, 8 + hgt * 1.3);
          B.trim.addGeometry(BOXG, mat4(c.x, c.y, c.z, yaw, 5.2, hgt * 2.6, 12.2), new THREE.Color(fpick([0xc0392b, 0x2471a3, 0xd4ac0d, 0x1e8449, 0x7f8c8d, 0xe67e22])));
        }
        inst.beacon.push({ x: br.x, y: 32, z: br.z, s: 3 });
      }
    };
    ship(1500, -650, 0.15, 'cruise'); ship(2300, 350, -0.4, 'cargo'); ship(3100, -1500, 0.3, 'cargo');
    // hide the environment's generic far boxes (mountains stay) -- replaced by this skyline
    const dg = game.env?.distant?.group;
    if (dg) dg.children.forEach((c) => { if (c.isInstancedMesh) c.visible = false; });
  }
  // ---------- build batches ----------
  root.add(B.band.build(M.band), B.shop.build(M.shop), B.office.build(M.office), B.deco.build(M.deco), B.glass.build(M.glass), B.roof.build(M.roof, { cast: false }), B.trim.build(M.trim),
    B.slab.build(M.slab, { cast: false }), B.marks.build(M.markings, { cast: false }), B.neon.build(M.neon, { cast: false }));
  if (!B.grass.empty) root.add(B.grass.build(M.grass, { cast: false }));
  if (!B.lotAsphalt.empty) root.add(B.lotAsphalt.build(M.asphalt, { cast: false }));
  root.add(B.wood.build(M.wood, { cast: false }));
  const finMat = new THREE.MeshBasicMaterial({ map: finSignTexture(renderer), transparent: true, alphaTest: 0.08, depthWrite: false, toneMapped: false });
  if (!B.fin.empty) root.add(B.fin.build(finMat, { cast: false, receive: false }));
  const signMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.08, depthWrite: false, toneMapped: false });
  {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 640; const x = c.getContext('2d');
    const cols = ['#ff4fd8', '#3df2ff', '#7fffd4', '#ffd23f', '#5dff9a', '#9ecbff', '#ff7ae6', '#ffb347', '#ffffff', '#ff3b3b'];
    SIGN_NAMES.forEach((n, i) => {
      const X = (i % 2) * 512 + 256, Y = Math.floor(i / 2) * 128 + 66;
      if (i >= 8) { x.fillStyle = i === 8 ? '#1d3557' : '#111'; x.fillRect(X - 250, Y - 60, 500, 120); }
      x.font = 'bold 70px "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = cols[i]; x.shadowBlur = 18; x.fillStyle = cols[i]; x.fillText(n, X, Y, 480); x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = 0.6; x.fillText(n, X, Y, 480); x.globalAlpha = 1;
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; signMat.map = t;
  }
  if (!B.sign.empty) root.add(B.sign.build(signMat, { cast: false, receive: false }));
  if (!B.water.empty) { const wm = B.water.build(M.water, { cast: false }); root.add(wm); }

  // ---------- instanced props ----------
  const dummy = new THREE.Object3D();
  function makeInst(geom, mat, items, { cast = true, receive = true, colors = false } = {}) {
    const im = new THREE.InstancedMesh(geom, mat, Math.max(1, items.length));
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y || 0, it.z); dummy.rotation.set(0, it.ry || 0, 0);
      if (it.sy != null) dummy.scale.set(it.sx ?? 1, it.sy, it.sz ?? 1); else dummy.scale.setScalar(it.s || 1);
      dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      if (colors) im.setColorAt(i, col.set(it.color ?? 0xffffff));
    });
    im.count = items.length; im.castShadow = cast; im.receiveShadow = receive;
    im.computeBoundingSphere(); root.add(im); return im;
  }

  // ---- CC0 model instancing helper ----
  const modelInst = (scene, items, { scale = 1, cast = true, autoFace = false, cutout = false, colors = false } = {}) => {
    if (!scene || !items.length) return !!scene;
    scene.updateMatrixWorld(true);
    const meshes = []; scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    let flip = false;
    if (autoFace) { // put the backrest (upper vertices) at -Z so the sitter faces +Z like the procedural bench
      let sz = 0, n = 0; const v = new THREE.Vector3();
      for (const m of meshes) { const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i += 2) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); if (v.y > 0.6) { sz += v.z; n++; } } }
      flip = n > 0 && sz / n > 0;
    }
    for (const m of meshes) {
      const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); if (flip) g.rotateY(Math.PI); g.scale(scale, scale, scale);
      for (const mt of Array.isArray(m.material) ? m.material : [m.material]) { if (cutout) { mt.alphaTest = 0.5; mt.transparent = false; mt.side = THREE.DoubleSide; } if (mt.map) mt.map.anisotropy = 4; }
      makeInst(g, m.material, items, { cast, colors });
    }
    return true;
  };
  // AC units
  makeInst(merge([[BOXG, mat4(0, 0.55, 0, 0, 1.8, 1.1, 1.3)], [new THREE.CylinderGeometry(0.42, 0.42, 0.06, 14), mat4(0, 1.12, 0)]]),
    new THREE.MeshStandardMaterial({ color: 0xc9cdd0, roughness: 0.5, metalness: 0.4 }), inst.ac);
  // water tanks
  makeInst(merge([[new THREE.CylinderGeometry(1.3, 1.3, 2.4, 14), mat4(0, 2.6, 0)], [new THREE.ConeGeometry(1.4, 0.8, 14), mat4(0, 4.2, 0)],
    [BOXG, mat4(-0.9, 0.7, -0.9, 0, 0.15, 1.4, 0.15)], [BOXG, mat4(0.9, 0.7, -0.9, 0, 0.15, 1.4, 0.15)], [BOXG, mat4(-0.9, 0.7, 0.9, 0, 0.15, 1.4, 0.15)], [BOXG, mat4(0.9, 0.7, 0.9, 0, 0.15, 1.4, 0.15)]]),
    new THREE.MeshStandardMaterial({ color: 0x8a6e52, roughness: 0.85 }), inst.tank);
  // antennas
  makeInst(merge([[new THREE.CylinderGeometry(0.08, 0.2, 1, 6), mat4(0, 0.5, 0)]]), M.metal, inst.antenna);
  // beacons
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
  makeInst(new THREE.SphereGeometry(0.35, 8, 6), beaconMat, inst.beacon, { cast: false });
  // helipads
  {
    const hm = new THREE.MeshStandardMaterial({ map: helipadTexture(renderer), roughness: 0.8 });
    const g = new THREE.CylinderGeometry(9, 9, 0.5, 32);
    makeInst(g, [new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.8 }), hm, hm], inst.heli);
    // fix cylinder top uv to show the H: CylinderGeometry cap uv is already a 0..1 disc map
  }
  // street lamps
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd7a0, emissiveIntensity: 0, roughness: 0.4 });
  {
    const pole = merge([[new THREE.CylinderGeometry(0.07, 0.11, 7.5, 8), mat4(0, 3.75, 0)], [new THREE.CylinderGeometry(0.2, 0.24, 0.6, 8), mat4(0, 0.3, 0)],
      [BOXG, mat4(0, 7.35, 1.1, 0, 0.09, 0.09, 2.3)]]);
    makeInst(pole, M.metal, inst.lamp);
    const head = merge([[BOXG, mat4(0, 7.22, 2.25, 0, 0.42, 0.14, 0.9)]]);
    makeInst(head, lampHeadMat, inst.lamp, { cast: false });
  }
  // light pools (night)
  const poolMat = new THREE.MeshBasicMaterial({ map: radialTexture(renderer), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc890 });
  { const g = new THREE.PlaneGeometry(11, 11); g.rotateX(-Math.PI / 2); const im = makeInst(g, poolMat, inst.pool, { cast: false, receive: false }); im.renderOrder = 2; im.visible = false; poolMat.userData.mesh = im; }
  // traffic lights
  const tlMat = { r: [], y: [], g: [] };
  {
    const mast = merge([[new THREE.CylinderGeometry(0.11, 0.15, 6.4, 8), mat4(0, 3.2, 0)], [BOXG, mat4(3.6, 6.25, 0, 0, 7.2, 0.14, 0.14)], [new THREE.CylinderGeometry(0.22, 0.26, 0.4, 8), mat4(0, 0.2, 0)]]);
    makeInst(mast, M.metal, inst.tlMast);
    const head = merge([[BOXG, mat4(0, 0, 0, 0, 0.42, 1.15, 0.32), 0x2a2d24], [BOXG, mat4(0, 0.36, 0.22, 0, 0.36, 0.05, 0.12), 0x111111], [BOXG, mat4(0, 0, 0.22, 0, 0.36, 0.05, 0.12), 0x111111], [BOXG, mat4(0, -0.36, 0.22, 0, 0.36, 0.05, 0.12), 0x111111]]);
    makeInst(head, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), inst.tlHead);
    const lg = new THREE.SphereGeometry(0.13, 6, 4);
    const L = (color, dy) => {
      for (const axis of ['z', 'x']) {
        const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
        const items = inst.tlHead.filter((h) => h.axis === axis).map((h) => ({ x: h.x + Math.sin(h.ry) * 0.17, y: h.y + dy, z: h.z + Math.cos(h.ry) * 0.17, ry: h.ry }));
        makeInst(lg, m, items, { cast: false, receive: false });
        m.userData.axis = axis; m.userData.base = new THREE.Color(color);
        (color === 0xff2a1a ? tlMat.r : color === 0xffb000 ? tlMat.y : tlMat.g).push(m);
      }
    };
    L(0xff2a1a, 0.36); L(0xffb000, 0); L(0x20ff70, -0.36);
  }
  // palms: 9 unique variants (6-16m), per-instance tint, vertex-shader wind sway
  const windU = { uWindTime: { value: 0 }, uGust: { value: 0.4 } };
  const windPatch = (frond) => (sh) => {
    sh.uniforms.uWindTime = windU.uWindTime; sh.uniforms.uGust = windU.uGust;
    sh.vertexShader = 'uniform float uWindTime;\nuniform float uGust;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 ipw = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 ipw = vec2(0.0);
      #endif
      float ph = fract(sin(dot(ipw, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
      float amp = 0.55 + 0.9 * fract(ph * 7.13);
      float hN = clamp(transformed.y / 11.0, 0.0, 1.6); float bend = hN * hN;
      float sway = (sin(uWindTime * 1.3 + ph) * 0.6 + sin(uWindTime * 2.7 + ph * 1.7) * 0.25) * (0.3 + uGust) * amp;
      transformed.x += bend * sway * 0.45;
      transformed.z += bend * (sway * 0.2 + cos(uWindTime * 1.1 + ph) * 0.1 * amp);
      ${frond ? 'transformed.y += sin(uWindTime * 4.5 + ph + transformed.x * 1.3 + transformed.z) * 0.12 * uv.y * (0.4 + uGust) * amp;' : ''}`);
  };
  {
    const VM = sharedVegMaterials(), trunkMat = VM.bark; // vegetation track: shared bark / leaf materials
    const frondMap = frondTexture(renderer);
    const frondMat = VM.leaf;
    const nutMat = new THREE.MeshStandardMaterial({ color: 0x5a4a20, roughness: 0.7 });
    nutMat.onBeforeCompile = windPatch(false);
    const frondDepth = VM.leafDepth; void frondMap;
    const trunkDepth = VM.barkDepth;
    const pr = rng(77);
    const NV = inst.palm.length;
    for (let v = 0; v < NV; v++) {
      const H = 6 + (10 * v) / (NV - 1) + pr() * 0.8;
      const pg = palmGeometry(v * 2.3 + 1, H, 0.03 + pr() * 0.27, pr, { bow: (pr() - 0.5) * 2, fronds: 9 + ((pr() * 8) | 0), frondLen: 0.8 + pr() * 0.45 + H * 0.015, droop: 0.75 + pr() * 0.7 });
      const t = makeInst(pg.trunk, trunkMat, inst.palm[v]); t.customDepthMaterial = trunkDepth;
      const f = makeInst(pg.fronds, frondMat, inst.palm[v], { colors: true }); f.customDepthMaterial = frondDepth;
      const nb = new Batch();
      for (let k = 0; k < 3; k++) { const a = k * 2.1; nb.addGeometry(pg.nuts, mat4(pg.top.x + Math.cos(a) * 0.25, pg.top.y - 0.3, pg.top.z + Math.sin(a) * 0.25), 0xffffff); }
      makeInst(nb.build(null).geometry, nutMat, inst.palm[v], { cast: false });
    }
    // royal palms: straight smooth grey trunk + green crownshaft + arching crown
    const royalMat = new THREE.MeshStandardMaterial({ map: trunkMat.map, color: 0xc8c4bc, roughness: 0.8, side: THREE.DoubleSide }); royalMat.onBeforeCompile = windPatch(false);
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x5f8f3a, roughness: 0.6 }); shaftMat.onBeforeCompile = windPatch(false);
    inst.royal.forEach((arr, v) => {
      const H = 11 + v * 1.6 + pr() * 1.2;
      const pg = palmGeometry(40 + v, H, 0.01 + pr() * 0.03, pr, { bow: (pr() - 0.5) * 0.3, fronds: 13 + ((pr() * 5) | 0), frondLen: 1.25 + pr() * 0.2, droop: 0.45 + pr() * 0.2 });
      const t = makeInst(pg.trunk, royalMat, arr); t.customDepthMaterial = trunkDepth;
      const f = makeInst(pg.fronds, frondMat, arr, { colors: true }); f.customDepthMaterial = frondDepth;
      const sg = new THREE.CylinderGeometry(0.2, 0.25, 2.4, 10); sg.translate(pg.top.x, pg.top.y - 1.2, pg.top.z);
      makeInst(sg, shaftMat, arr);
    });
    // palmettos: short shrubby palms with dense short fronds
    inst.palmetto.forEach((arr, v) => {
      const pg = palmGeometry(70 + v, 1.2 + v * 0.5, 0.05 + pr() * 0.1, pr, { fronds: 18 + ((pr() * 6) | 0), frondLen: 0.42 + pr() * 0.1, droop: 0.25 });
      makeInst(pg.trunk, trunkMat, arr, { cast: false });
      const f = makeInst(pg.fronds, frondMat, arr, { colors: true }); f.customDepthMaterial = frondDepth;
    });
  }
  // bushes
  {
    const g = new THREE.IcosahedronGeometry(0.8, 1); const P = g.attributes.position; const br = rng(5);
    for (let i = 0; i < P.count; i++) { const k = 0.85 + br() * 0.3; P.setXYZ(i, P.getX(i) * k, P.getY(i) * k * 0.75, P.getZ(i) * k); }
    g.computeVertexNormals();
    makeInst(g, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), inst.bush, { colors: true });
  }
  // benches
  if (!modelInst(mBench, inst.bench, { scale: 1.3, autoFace: true })) {
    const g = merge([[BOXG, mat4(0, 0.45, 0, 0, 1.8, 0.07, 0.5), 0xb07a4a], [BOXG, mat4(0, 0.75, -0.24, 0, 1.8, 0.45, 0.06), 0xb07a4a],
      [BOXG, mat4(-0.75, 0.22, 0, 0, 0.08, 0.45, 0.5), 0x333333], [BOXG, mat4(0.75, 0.22, 0, 0, 0.08, 0.45, 0.5), 0x333333]]);
    makeInst(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), inst.bench);
  }
  // umbrellas
  {
    const g = merge([[new THREE.ConeGeometry(1.6, 0.6, 10, 1, true), mat4(0, 2.3, 0)], [new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), mat4(0, 1.2, 0)]]);
    makeInst(g, new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), inst.umbrella, { colors: true });
  }
  // hydrants
  if (!modelInst(mHydrant, inst.hydrant, { scale: 1.0, cast: false }))   makeInst(merge([[new THREE.CylinderGeometry(0.14, 0.17, 0.6, 10), mat4(0, 0.3, 0)], [new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat4(0, 0.6, 0)],
    [new THREE.CylinderGeometry(0.06, 0.06, 0.42, 6), tmpM.clone().compose(tmpP.set(0, 0.42, 0), tmpQ.setFromEuler(tmpE.set(0, 0, Math.PI / 2)), tmpS.set(1, 1, 1))]]),
    new THREE.MeshStandardMaterial({ color: 0xd8261c, roughness: 0.45, metalness: 0.3 }), inst.hydrant);
  // trash bins: municipal metal can (model), green slatted bin, blue recycling bin
  if (!modelInst(mTrash, inst.bin, { scale: 1.05, cast: false })) inst.bin2.push(...inst.bin);
  makeInst(merge([[BOXG, mat4(0, 0.5, 0, 0, 0.62, 1.0, 0.55), 0x2a6fdb], [BOXG, mat4(0, 1.03, -0.02, 0, 0.66, 0.06, 0.6), 0x1d4fa0], [BOXG, mat4(0, 0.75, 0.28, 0, 0.3, 0.12, 0.02), 0xffffff]]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), inst.bin3);
  // dumpsters (Kenney, scaled to ~1.7 x 1.3 x 2.2 m) or procedural fallback
  if (!modelInst(mDumpster, inst.dumpster, { scale: 6 })) makeInst(merge([[BOXG, mat4(0, 0.65, 0, 0, 1.7, 1.3, 2.2)]]), new THREE.MeshStandardMaterial({ roughness: 0.6 }), inst.dumpster, { colors: true });
  { // terracotta pots (light procedural lathe; the CC0 clay-pot model was 3k tris each)
    const prof = [[0.0, 0], [0.22, 0], [0.26, 0.04], [0.3, 0.42], [0.34, 0.46], [0.34, 0.52], [0.29, 0.52], [0.27, 0.47]].map(([r, y]) => new THREE.Vector2(r, y));
    makeInst(new THREE.LatheGeometry(prof, 12), new THREE.MeshStandardMaterial({ color: 0xb8643c, roughness: 0.85 }), inst.pot, { cast: false }); }
  modelInst(mFern, inst.fern, { scale: 1, cutout: true, cast: false });
  // street-name signs (atlas: 2 columns x 10 rows; 0-9 avenues, 10-19 streets)
  if (inst.streetSign.length) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1280; const x = c.getContext('2d');
    [...AVE_NAMES, ...ST_NAMES].forEach((n, i) => {
      const X = (i % 2) * 512, Y = Math.floor(i / 2) * 128;
      x.fillStyle = '#0f6b3a'; x.fillRect(X, Y, 512, 128); x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(X + 8, Y + 8, 496, 112);
      x.fillStyle = '#fff'; x.font = 'bold 64px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n, X + 256, Y + 66, 470);
    });
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const sb = new Batch();
    for (const sgn of inst.streetSign) { const col2 = sgn.k % 2, row = Math.floor(sgn.k / 2); sb.addGeometry(new THREE.PlaneGeometry(2.4, 0.6), mat4(sgn.x, sgn.y, sgn.z, sgn.ry), 0xffffff, [0.5, 0.1], [col2 * 0.5, 1 - (row + 1) * 0.1]); sb.addGeometry(new THREE.BoxGeometry(2.42, 0.62, 0.04), mat4(sgn.x - Math.sin(sgn.ry) * 0.03, sgn.y, sgn.z - Math.cos(sgn.ry) * 0.03, sgn.ry), 0x0f6b3a, [0, 0], [0.002, 0.9995]); }
    root.add(sb.build(new THREE.MeshStandardMaterial({ map: tx, roughness: 0.5, metalness: 0.1 }), { cast: false }));
  }
  modelInst(mShrub, inst.shrub, { scale: 1, cutout: true });
  // litter + puddles
  makeInst(new THREE.BoxGeometry(0.16, 0.01, 0.22), new THREE.MeshStandardMaterial({ roughness: 0.8 }), inst.litter, { cast: false, colors: true });
  { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const pr2 = rng(808);
    for (let i = 0; i < 10; i++) { const g = x.createRadialGradient(64 + (pr2() - 0.5) * 40, 64 + (pr2() - 0.5) * 40, 0, 64, 64, 22 + pr2() * 26); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
    const pg = new THREE.PlaneGeometry(2.6, 2.6); pg.rotateX(-Math.PI / 2);
    makeInst(pg, new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.04, metalness: 0.0, alphaMap: new THREE.CanvasTexture(c), transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, envMapIntensity: 1.5 }), inst.puddle, { cast: false, receive: true }); }
  // graffiti (original procedural tags) on alley walls & dumpsters
  if (graffiti.length) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d'); const gr = rng(4242);
    const TAGS = ['ZEPH', 'K-ROW', 'SOLO', 'MANGO', 'VYBE', 'NOVA', 'RAZ', 'OKE'];
    TAGS.forEach((t, i) => {
      const X = (i % 4) * 256 + 128, Y = Math.floor(i / 4) * 256 + 128;
      const c1 = `hsl(${(gr() * 360) | 0},90%,60%)`, c2 = `hsl(${(gr() * 360) | 0},90%,55%)`;
      x.save(); x.translate(X, Y); x.rotate((gr() - 0.5) * 0.35);
      x.font = `bold ${t.length > 4 ? 58 : 72}px "Arial Black", Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineJoin = 'round'; x.lineWidth = 16; x.strokeStyle = '#111'; x.strokeText(t, 0, 0);
      const g = x.createLinearGradient(0, -36, 0, 36); g.addColorStop(0, c1); g.addColorStop(1, c2);
      x.fillStyle = g; x.fillText(t, 0, 0); x.lineWidth = 3; x.strokeStyle = '#fff'; x.strokeText(t, -2, -2);
      x.fillStyle = c2; for (let k = 0; k < 5; k++) x.fillRect(-90 + gr() * 180, 26, 3, 10 + gr() * 34);
      x.restore();
    });
    const gt = new THREE.CanvasTexture(c); gt.colorSpace = THREE.SRGBColorSpace;
    const gb = new Batch();
    for (const g of graffiti) { const pg2 = new THREE.PlaneGeometry(g.s, g.s / 2); gb.addGeometry(pg2, mat4(g.x, g.y, g.z, g.ry), 0xffffff, [0.25, 0.5], [(g.k % 4) * 0.25, (1 - Math.floor(g.k / 4)) * 0.5]); }
    root.add(gb.build(new THREE.MeshStandardMaterial({ map: gt, transparent: true, alphaTest: 0.05, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { cast: false }));
  }
  makeInst(merge([[new THREE.CylinderGeometry(0.3, 0.27, 0.95, 12), mat4(0, 0.48, 0), 0x2f5d50], [new THREE.CylinderGeometry(0.33, 0.33, 0.08, 12), mat4(0, 0.98, 0), 0x223f37]]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }), inst.bin2);
  // bus stop shelters (local +Z faces road)
  makeInst(merge([[BOXG, mat4(0, 2.55, 0, 0, 4.2, 0.12, 1.9), 0xf4f4f4], [BOXG, mat4(0, 1.3, -0.75, 0, 4.0, 2.2, 0.05), 0x9fc6d4],
    [BOXG, mat4(-2.0, 1.3, 0, 0, 0.08, 2.5, 1.7), 0x606a70], [BOXG, mat4(2.0, 1.3, 0, 0, 0.08, 2.5, 1.7), 0x606a70],
    [BOXG, mat4(0, 0.48, -0.45, 0, 3.0, 0.08, 0.4), 0xb07a4a], [BOXG, mat4(0, 2.66, 0.9, 0, 4.2, 0.18, 0.08), 0x2ec4b6]]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), inst.busStop);
  // pier posts
  makeInst(new THREE.CylinderGeometry(0.22, 0.25, 6, 8).translate(0, 3, 0), M.wood, inst.pierPost, { receive: false });
  // flowering bushes (bougainvillea / hibiscus / frangipani), baked per-face colours
  {
    const blooms = [0xd81b8c, 0xff6fb5, 0xe0262f, 0xff8c2a, 0xfff2f2];
    blooms.forEach((bc, k) => {
      const g = new THREE.IcosahedronGeometry(0.8, 1).toNonIndexed(); const P = g.attributes.position; const fr = rng(100 + k);
      for (let i = 0; i < P.count; i++) { const kk = 0.85 + fr() * 0.3; P.setXYZ(i, P.getX(i) * kk, P.getY(i) * kk * 0.8, P.getZ(i) * kk); }
      g.computeVertexNormals();
      const cols = []; const cb = new THREE.Color(bc), cg = new THREE.Color();
      for (let f = 0; f < P.count / 3; f++) {
        const up = (P.getY(f * 3) + P.getY(f * 3 + 1) + P.getY(f * 3 + 2)) / 3;
        const c = fr() < (up > -0.1 ? 0.6 : 0.2) ? cb.clone().multiplyScalar(0.8 + fr() * 0.3) : cg.setHSL(0.27 + fr() * 0.06, 0.55, 0.18 + fr() * 0.1).clone();
        for (let v = 0; v < 3; v++) cols.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      makeInst(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), inst.flower[k]);
    });
  }
  // tree grates
  makeInst(merge([[BOXG, mat4(0, 0.01, 0, 0, 1.6, 0.02, 1.6), 0x3a3633], [BOXG, mat4(0, 0.016, 0, 0, 1.0, 0.02, 1.0), 0x5a4a38]]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }), inst.grate, { cast: false });
  // cafe tables with two chairs
  makeInst(merge([[new THREE.CylinderGeometry(0.45, 0.45, 0.04, 14), mat4(0, 0.75, 0), 0xf4f4f4], [new THREE.CylinderGeometry(0.04, 0.04, 0.75, 6), mat4(0, 0.37, 0), 0x333333],
    [new THREE.CylinderGeometry(0.25, 0.25, 0.03, 10), mat4(0, 0.015, 0), 0x333333],
    [BOXG, mat4(-0.8, 0.45, 0, 0, 0.42, 0.05, 0.42), 0x2e6e8e], [BOXG, mat4(-1.0, 0.7, 0, 0, 0.05, 0.5, 0.42), 0x2e6e8e], [BOXG, mat4(-0.8, 0.22, 0, 0, 0.36, 0.45, 0.36), 0x555555],
    [BOXG, mat4(0.8, 0.45, 0, 0, 0.42, 0.05, 0.42), 0x2e6e8e], [BOXG, mat4(1.0, 0.7, 0, 0, 0.05, 0.5, 0.42), 0x2e6e8e], [BOXG, mat4(0.8, 0.22, 0, 0, 0.36, 0.45, 0.36), 0x555555]]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }), inst.cafe);
  // bike racks (local x along the sidewalk)
  { const parts = []; for (let k = -3; k <= 3; k++) { parts.push([BOXG, mat4(k * 0.7, 0.45, -0.3, 0, 0.05, 0.9, 0.05), 0x9aa3a8], [BOXG, mat4(k * 0.7, 0.45, 0.3, 0, 0.05, 0.9, 0.05), 0x9aa3a8], [BOXG, mat4(k * 0.7, 0.9, 0, 0, 0.05, 0.05, 0.65), 0x9aa3a8]); }
    makeInst(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9 }), inst.bike); }
  // newspaper boxes
  makeInst(merge([[BOXG, mat4(0, 0.75, 0, 0, 0.5, 0.6, 0.45)], [BOXG, mat4(0, 0.25, 0, 0, 0.06, 0.5, 0.06)], [BOXG, mat4(0, 0.82, 0.23, 0, 0.38, 0.28, 0.02), 0x223344]]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }), inst.news, { colors: true });
  // decals: stains + cracks
  {
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); draw(x); const t = new THREE.CanvasTexture(c); return t; };
    const dr = rng(55);
    const stainTex = mk((x) => { for (let i = 0; i < 14; i++) { const g = x.createRadialGradient(64 + (dr() - 0.5) * 50, 64 + (dr() - 0.5) * 50, 0, 64, 64, 20 + dr() * 30); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); } });
    const crackTex = mk((x) => { x.strokeStyle = '#fff'; x.lineCap = 'round'; for (let k = 0; k < 3; k++) { let px = 10 + dr() * 20, py = 20 + dr() * 90; x.lineWidth = 2.5 - k * 0.6; x.beginPath(); x.moveTo(px, py); for (let i = 0; i < 9; i++) { px += 6 + dr() * 10; py += (dr() - 0.5) * 22; x.lineTo(px, py); } x.stroke(); } });
    const dm = (tex, op) => new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const pg = new THREE.PlaneGeometry(2.2, 2.2); pg.rotateX(-Math.PI / 2);
    makeInst(pg, dm(stainTex, 0.32), inst.stain, { cast: false, receive: false });
    makeInst(pg, dm(crackTex, 0.45), inst.crack, { cast: false, receive: false });
  }
  // asphalt patches (darker, slightly glossy) + manhole covers
  { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    makeInst(g, new THREE.MeshStandardMaterial({ color: 0x0e0e10, transparent: true, opacity: 0.38, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), inst.patch, { cast: false, receive: true });
    makeInst(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 14).translate(0, 0.015, 0), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.5, metalness: 0.7 }), inst.manhole, { cast: false }); }
  // beach loungers: white frame + coloured towel
  { const fr = merge([[BOXG, mat4(0, 0.32, 0.2, 0, 0.7, 0.06, 1.4)], [BOXG, tmpM.clone().compose(tmpP.set(0, 0.55, -0.75), tmpQ.setFromEuler(tmpE.set(-0.6, 0, 0)), tmpS.set(0.7, 0.06, 0.7))],
      [BOXG, mat4(-0.3, 0.15, 0.6, 0, 0.05, 0.3, 0.05)], [BOXG, mat4(0.3, 0.15, 0.6, 0, 0.05, 0.3, 0.05)], [BOXG, mat4(-0.3, 0.15, -0.3, 0, 0.05, 0.3, 0.05)], [BOXG, mat4(0.3, 0.15, -0.3, 0, 0.05, 0.3, 0.05)]]);
    makeInst(fr, new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 }), inst.bLounger);
    const tw = merge([[BOXG, mat4(0, 0.36, 0.25, 0, 0.6, 0.02, 1.25)], [BOXG, tmpM.clone().compose(tmpP.set(0, 0.59, -0.72), tmpQ.setFromEuler(tmpE.set(-0.6, 0, 0)), tmpS.set(0.6, 0.02, 0.62))]]);
    makeInst(tw, new THREE.MeshStandardMaterial({ roughness: 0.9 }), inst.bLounger, { colors: true, cast: false }); }
  // surfboards (leaning)
  { const g = new THREE.SphereGeometry(1, 12, 8); g.scale(0.28, 1.1, 0.045); g.rotateZ(-0.27); g.translate(0.15, 1.08, 0);
    makeInst(g, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 }), inst.board2, { colors: true }); }
  // bar stools
  makeInst(merge([[new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), mat4(0, 0.78, 0), 0xd9b07a], [new THREE.CylinderGeometry(0.04, 0.05, 0.78, 6), mat4(0, 0.39, 0), 0x6b4423]]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), inst.stool);
  // string-light bulbs
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
  makeInst(new THREE.SphereGeometry(0.06, 6, 4), bulbMat, inst.bulb, { cast: false, receive: false });
  // bicycles (0) and scooters (1): local +Z = front
  { const tyre = new THREE.TorusGeometry(0.33, 0.035, 6, 18); tyre.rotateY(Math.PI / 2);
    const bike = merge([[tyre, mat4(0, 0.34, 0.52), 0x1a1a1a], [tyre, mat4(0, 0.34, -0.52), 0x1a1a1a],
      [BOXG, mat4(0, 0.72, 0.02, 0, 0.04, 0.04, 0.62)], [BOXG, tmpM.clone().compose(tmpP.set(0, 0.55, 0.22), tmpQ.setFromEuler(tmpE.set(0.75, 0, 0)), tmpS.set(0.04, 0.6, 0.04))],
      [BOXG, tmpM.clone().compose(tmpP.set(0, 0.55, -0.28), tmpQ.setFromEuler(tmpE.set(-0.35, 0, 0)), tmpS.set(0.04, 0.45, 0.04))],
      [BOXG, mat4(0, 0.85, 0.47, 0, 0.04, 0.35, 0.04)], [BOXG, mat4(0, 1.02, 0.47, 0, 0.5, 0.03, 0.03), 0x333333], [BOXG, mat4(0, 0.92, -0.32, 0, 0.12, 0.05, 0.24), 0x222222]]);
    makeInst(bike, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 }), inst.twoWheel[0], { colors: true });
    const wheel = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12); wheel.rotateZ(Math.PI / 2);
    const scoot = merge([[wheel, mat4(0, 0.2, 0.55), 0x1a1a1a], [wheel, mat4(0, 0.2, -0.5), 0x1a1a1a], [BOXG, mat4(0, 0.3, 0.05, 0, 0.34, 0.12, 0.9)],
      [BOXG, mat4(0, 0.55, -0.35, 0, 0.5, 0.45, 0.7)], [BOXG, mat4(0, 0.82, -0.33, 0, 0.36, 0.1, 0.62), 0x3a2a20], [BOXG, mat4(0, 0.68, 0.42, 0, 0.44, 0.75, 0.08)],
      [BOXG, mat4(0, 0.95, 0.47, 0, 0.06, 0.4, 0.06), 0x333333], [BOXG, mat4(0, 1.14, 0.47, 0, 0.62, 0.04, 0.04), 0x333333], [new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10).rotateX(Math.PI / 2), mat4(0, 1.02, 0.5), 0xfff6d8]]);
    makeInst(scoot, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2 }), inst.twoWheel[1], { colors: true }); }
  // palm uplights: emissive ground discs + warm pooling decal
  const upMat = new THREE.MeshBasicMaterial({ color: 0xffd28a, toneMapped: false });
  makeInst(merge([[new THREE.CylinderGeometry(0.17, 0.2, 0.07, 10), mat4(0, 0.035, 0), 0x777777]]), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.7 }), inst.uplight, { cast: false });
  makeInst(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 10).translate(0, 0.075, 0), upMat, inst.uplight, { cast: false, receive: false });
  const upPoolMat = new THREE.MeshBasicMaterial({ map: radialTexture(renderer), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffb870 });
  { const g = new THREE.PlaneGeometry(4.5, 4.5); g.rotateX(-Math.PI / 2); g.translate(0.6, 0.05, 0);
    const im = makeInst(g, upPoolMat, inst.uplight, { cast: false, receive: false }); im.renderOrder = 2; }
  // wall-mounted AC units + porthole windows on deco facades
  makeInst(merge([[BOXG, mat4(0, 0, 0, 0, 0.75, 0.45, 0.5), 0xe8e8e4], [BOXG, mat4(0, 0, 0.255, 0, 0.6, 0.32, 0.02), 0x8a8f94], [BOXG, mat4(0, -0.3, -0.1, 0, 0.04, 0.16, 0.04), 0x9a9a9a]]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }), inst.wallAC);
  makeInst(new THREE.TorusGeometry(0.46, 0.08, 6, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), inst.porthole, { cast: false });
  const portGlass = new THREE.MeshStandardMaterial({ color: 0x1f3b48, roughness: 0.1, metalness: 0.6, emissive: 0xffc98a, emissiveIntensity: 0 });
  makeInst(new THREE.CircleGeometry(0.44, 18), portGlass, inst.porthole, { cast: false });
  // pool loungers
  makeInst(merge([[BOXG, mat4(0, 0.35, 0.2, 0, 0.7, 0.08, 1.4)], [BOXG, tmpM.clone().compose(tmpP.set(0, 0.55, -0.75), tmpQ.setFromEuler(tmpE.set(-0.6, 0, 0)), tmpS.set(0.7, 0.08, 0.7))],
    [BOXG, mat4(0, 0.16, 0, 0, 0.6, 0.32, 1.6)]]), new THREE.MeshStandardMaterial({ roughness: 0.6 }), inst.lounger, { colors: true });
  // billboard panels (atlas)
  const adMat = new THREE.MeshStandardMaterial({ map: adsTexture(renderer), emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.55 });
  adMat.emissiveMap = adMat.map;
  {
    const front = new Batch(), back = new Batch();
    for (const b of inst.board) {
      const c = b.ad % 4, r = Math.floor(b.ad / 4);
      const pg = new THREE.PlaneGeometry(12, 6);
      front.addGeometry(pg, mat4(b.x + Math.sin(b.ry) * 0.21, b.y, b.z + Math.cos(b.ry) * 0.21, b.ry), 0xffffff, [0.25, 0.5], [c * 0.25, (1 - r) * 0.5]);
      back.addGeometry(BOXG, mat4(b.x, b.y, b.z, b.ry, 12.4, 6.4, 0.4), 0x3a3d40);
    }
    if (!front.empty) { root.add(front.build(adMat)); root.add(back.build(M.trim)); }
  }

  // ---------- day/night updater ----------
  let tlTime = 0;
  const tLight = (axis) => {
    const t = tlTime % 24;
    if (axis === 'z') return t < 10 ? 'green' : t < 12 ? 'yellow' : 'red';
    return t < 12 ? 'red' : t < 22 ? 'green' : 'yellow';
  };
  const nightFactor = (t) => (t >= 19.5 || t < 6 ? 1 : t > 18.6 ? (t - 18.6) / 0.9 : t < 7 ? 1 - (t - 6) : 0);
  const _gs = new THREE.Vector3(), _gm = new THREE.Matrix4(), _gv = new THREE.Vector3(), _gq = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _ge = new THREE.Euler();
  let wheelA = 0, boatT = 0;
  game.updaters.push((dt) => {
    tlTime += dt;
    { const T = (windU.uWindTime.value += dt); windU.uGust.value = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(T * 0.13)) + 0.35 * Math.max(0, Math.sin(T * 0.41) * Math.sin(T * 0.067 + 1.3)); }
    { // ferris wheel + boats
      const u = pierWheel.userData; wheelA += dt * 0.045; u.spin.rotation.z = wheelA;
      for (let i = 0; i < u.NS; i++) {
        const a = wheelA + (i / u.NS) * Math.PI * 2;
        _gv.set(PIER_Z * 0 + u.WX, u.WY + Math.sin(a) * u.WR, PIER_Z - Math.cos(a) * u.WR);
        _gm.compose(_gv, _gq.identity(), _one); u.gondola.setMatrixAt(i, _gm);
      }
      u.gondola.instanceMatrix.needsUpdate = true;
      boatT += dt;
      boats.forEach((b, i) => {
        _gv.set(b.x, -0.25 + Math.sin(boatT * 1.1 + b.ph) * 0.12, b.z);
        _gq.setFromEuler(_ge.set(Math.sin(boatT * 0.9 + b.ph) * 0.04, b.ry, Math.sin(boatT * 0.7 + b.ph * 2) * 0.05));
        _gm.compose(_gv, _gq, _gs.set(b.s, b.s, b.s)); u.boatMesh.setMatrixAt(i, _gm);
      });
      u.boatMesh.instanceMatrix.needsUpdate = true;
    }
    const n = nightFactor(game.timeOfDay ?? 12);
    winU.uWinTime.value += dt;
    { const wt = game.timeOfDay ?? 12; winU.uWinDensity.value = wt >= 17 || wt < 0.5 ? 0.85 : wt < 5 ? 0.45 : 0.6; }
    M.office.emissiveIntensity = 0.04 + 1.0 * n;
    M.shop.emissiveIntensity = 0.35 + 1.1 * n;
    M.band.emissiveIntensity = 0.04 + 1.0 * n;
    M.deco.emissiveIntensity = 0.04 + 1.0 * n;
    M.glass.emissiveIntensity = 0.03 + 0.9 * n;
    lampHeadMat.emissiveIntensity = 6 * n;
    poolMat.opacity = 0.5 * n; poolMat.userData.mesh.visible = n > 0.02;
    const tod = game.timeOfDay ?? 12;
    const dusk = tod >= 18.0 ? Math.min(1, (tod - 18.0) / 0.5) : tod < 6.2 ? 1 : tod < 6.7 ? (6.7 - tod) / 0.5 : 0;
    M.neon.color.setScalar(1 + 2.4 * dusk);
    bulbMat.color.setRGB(1, 0.85, 0.63).multiplyScalar(0.35 + 3.2 * dusk);
    upMat.color.setRGB(1, 0.82, 0.54).multiplyScalar(0.3 + 3.5 * dusk);
    upPoolMat.opacity = 0.7 * dusk;
    portGlass.emissiveIntensity = 1.2 * n;
    if (M.tikiSign) M.tikiSign.color.setScalar(0.8 + 1.8 * dusk);
    finMat.color.setScalar(0.9 + 2.0 * n);
    signMat.color.setScalar(0.9 + 2.2 * dusk);
    adMat.emissiveIntensity = 0.12 + 0.9 * n;
    const blink = (game.clock?.elapsed ?? tlTime) % 1.6 < 0.25;
    beaconMat.color.setRGB(blink ? 4 : 0.25, blink ? 0.2 : 0.02, blink ? 0.2 : 0.02);
    for (const [arr, state] of [[tlMat.r, 'red'], [tlMat.y, 'yellow'], [tlMat.g, 'green']]) for (const m of arr) {
      const on = tLight(m.userData.axis) === state;
      m.color.copy(m.userData.base).multiplyScalar(on ? 3 : 0.06);
    }
  });

  // ---------- API ----------
  const roads = [];
  for (const x of XS) roads.push({ x1: x, z1: ZS[0], x2: x, z2: ZS[ZS.length - 1], width: RW });
  for (const z of ZS) roads.push({ x1: XS[0], z1: z, x2: XS[XS.length - 1], z2: z, width: RW });
  const totalSW = sidewalkSegs.reduce((s, g) => s + g.len, 0);

  // ---------- CONTRACT4 API (shared with the Miami city) ----------
  const onPier = (x, z) => Math.abs(z - PIER_Z) <= PIER_HW && x >= PIER_X0 && x <= PIER_X1;
  const onBoardwalk = (x, z) => x >= 446 && x <= 452 && Math.abs(z) <= 450;
  const blockAt = (x, z) => { for (const b of blockList) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b; return null; };
  const ZONE_OF = { promenade: 'beach', deco: 'nightlife', tower: 'downtown', plaza: 'downtown', mid: 'business', decomid: 'commercial', parking: 'commercial', low: 'residential', edge: 'residential', park: 'park' };
  // road graph from the grid: nodes at intersections, one edge per block-length road piece
  const rgNodes = [], rgEdges = [], nodeId = (i, j) => i * ZS.length + j, adj = new Map();
  XS.forEach((x, i) => ZS.forEach((z, j) => rgNodes.push({ id: nodeId(i, j), x, z })));
  const addEdge = (a, b, name, kind, speed) => {
    const A = rgNodes[a], Bn = rgNodes[b];
    const e = { id: rgEdges.length, a, b, pts: [[A.x, A.z], [Bn.x, Bn.z]], width: RW, lanesFwd: 2, lanesBack: 2, oneway: false, speedKmh: speed, name, kind, bridge: false, y: [0, 0], length: Math.hypot(Bn.x - A.x, Bn.z - A.z) };
    rgEdges.push(e); for (const n of [a, b]) { if (!adj.has(n)) adj.set(n, []); adj.get(n).push(e); }
  };
  XS.forEach((x, i) => { for (let j = 0; j < ZS.length - 1; j++) addEdge(nodeId(i, j), nodeId(i, j + 1), AVE_NAMES[i], i === XS.length - 1 ? 'primary' : i % 3 === 1 ? 'primary' : 'secondary', i === XS.length - 1 ? 40 : 50); });
  ZS.forEach((z, j) => { for (let i = 0; i < XS.length - 1; i++) addEdge(nodeId(i, j), nodeId(i + 1, j), ST_NAMES[j], j % 3 === 1 ? 'primary' : 'secondary', 50); });
  const segDist = (e, x, z) => { const [ax, az] = e.pts[0], [bx, bz] = e.pts[1], dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); const px = ax + dx * t, pz = az + dz * t; return { t, px, pz, d: Math.hypot(x - px, z - pz), dx: dx / e.length, dz: dz / e.length }; };
  const roadGraph = {
    nodes: rgNodes, edges: rgEdges,
    nearestEdge(x, z) { let best = null, bd = Infinity, bs = null; for (const e of rgEdges) { const r = segDist(e, x, z); if (r.d < bd) { bd = r.d; best = e; bs = r; } } return best ? { edge: best, t: bs.t, dist: bd, point: { x: bs.px, z: bs.pz }, dir: { x: bs.dx, z: bs.dz } } : null; },
    edgesAt(id) { return adj.get(id) || []; },
  };
  const rectPoly = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const mapLayers = {
    land: [rectPoly(-520, -520, WATER_LINE, 520)],
    water: [rectPoly(WATER_LINE, -1600, 3000, 1600)],
    beach: [rectPoly(BEACH_X0, -520, WATER_LINE, 520)],
    park: blockList.filter((b) => b.type === 'park' || b.type === 'plaza').map((b) => rectPoly(b.x0 + SW, b.z0 + SW, b.x1 - SW, b.z1 - SW)),
    buildingPolys: buildings.map((b) => rectPoly(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2)),
    roadEdges: rgEdges.map((e) => e.pts),
  };
  const near2 = (p, near, radius) => !near || Math.hypot(p.x - near.x, p.z - near.z) <= radius;
  const city = {
    half: 500,
    grid: { block: 100, roadWidth: RW, xs: XS.slice(), zs: ZS.slice(), laneOffsets: [1.75, 5.25], sidewalkWidth: SW, curbHeight: CURB },
    bounds: { minX: -500, maxX: 760, minZ: -500, maxZ: 500 },
    roads, buildings, roadGraph, mapLayers,
    playerSpawn: new THREE.Vector3(433.5, CURB + 0.05, -24), playerSpawnHeading: 0,
    randomRoadPoint(near = null, radius = 250) {
      let cands = rgEdges;
      if (near) { const c = rgEdges.filter((e) => segDist(e, near.x, near.z).d < radius); if (c.length) cands = c; }
      for (let attempt = 0; attempt < 30; attempt++) {
        const e = cands[(Math.random() * cands.length) | 0];
        const m = (HW + 6) / e.length, t = m + Math.random() * (1 - 2 * m);
        const fwd = Math.random() < 0.5, [ax, az] = e.pts[0], [bx, bz] = e.pts[1];
        let dx = (bx - ax) / e.length, dz = (bz - az) / e.length; if (!fwd) { dx = -dx; dz = -dz; }
        const laneOffset = Math.random() < 0.5 ? 1.75 : 5.25, rx = -dz, rz = dx;
        const position = new THREE.Vector3(ax + (bx - ax) * t + rx * laneOffset, 0, az + (bz - az) * t + rz * laneOffset);
        if (near && attempt < 29 && !near2(position, near, radius)) continue;
        return { position, heading: Math.atan2(dx, dz), edgeId: e.id, laneOffset };
      }
      return null;
    },
    randomSidewalkPoint(near = null, radius = 250, zone = null) {
      // candidate segments: those whose closest point lies within radius (and optionally in the zone)
      const segPt = (g, t) => new THREE.Vector3(g.x0 + (g.x1 - g.x0) * t, g.y ?? (g.x0 > 445 ? 0.22 : CURB), g.z0 + (g.z1 - g.z0) * t);
      let cands = sidewalkSegs;
      if (near || zone) {
        cands = sidewalkSegs.filter((g) => {
          if (near) { const dx = g.x1 - g.x0, dz = g.z1 - g.z0, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((near.x - g.x0) * dx + (near.z - g.z0) * dz) / L2)); if (Math.hypot(g.x0 + dx * t - near.x, g.z0 + dz * t - near.z) > radius) return false; }
          return !zone || city.zoneAt((g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2) === zone;
        });
        if (!cands.length) cands = sidewalkSegs;
      }
      const tot = cands.reduce((a, g) => a + g.len, 0);
      for (let attempt = 0; attempt < 30; attempt++) {
        let r = Math.random() * tot, g = cands[0];
        for (const s2 of cands) { if (r <= s2.len) { g = s2; break; } r -= s2.len; }
        const p = segPt(g, Math.random());
        if (near && attempt < 29 && !near2(p, near, radius)) continue;
        return p;
      }
      return new THREE.Vector3(433.5, CURB, 0);
    },
    waterLine: WATER_LINE, seaLevel: SEA_LEVEL,
    groundHeightAt(x, z = 0) {
      if (onPier(x, z) && x >= PIER_X0 + 16) return PIER_Y;
      if (onBoardwalk(x, z)) return 0.22;
      if (x >= BEACH_X0) return sandProfile(x);
      return blockAt(x, z) ? CURB : 0;
    },
    isWater(x, z) { return x > WATER_LINE && !onPier(x, z); },
    surfaceAt(x, z) {
      if (onPier(x, z) || onBoardwalk(x, z)) return 'wood';
      if (x > WATER_LINE) return 'water';
      if (x >= BEACH_X0) return 'sand';
      if (x < -500 || z < -500 || z > 500) return 'grass_long';
      const b = blockAt(x, z);
      if (!b) return 'asphalt';
      if (b.type === 'promenade') return 'pavers';
      if (b.type === 'edge') return 'grass_long';
      if (!(x > b.x0 + SW && x < b.x1 - SW && z > b.z0 + SW && z < b.z1 - SW)) return 'concrete';
      if (b.type === 'park') return Math.abs(x - b.cx) < 2 || Math.abs(z - b.cz) < 2 ? 'concrete' : 'grass_short';
      if (b.type === 'plaza' || b.type === 'tower') return 'tile';
      if (b.type === 'parking') return 'asphalt';
      if (b.type === 'low') return 'grass_short';
      return 'concrete';
    },
    zoneAt(x, z) {
      if (city.isWater(x, z)) return 'water';
      if (x >= BEACH_X0 - 13) return 'beach';
      const b = blockAt(x, z) || blockAt(x + 9, z + 9) || blockAt(x - 9, z - 9) || blockAt(x + 9, z - 9) || blockAt(x - 9, z + 9);
      return b ? ZONE_OF[b.type] || 'commercial' : 'commercial';
    },
    districtAt(x, z) {
      if (x > WATER_LINE) return onPier(x, z) ? 'Southline Pier' : 'Southline Bay';
      if (x >= BEACH_X0 - 13) return 'Coral Beach';
      if (x >= 320) return 'Deco District';
      if (Math.hypot(x + 30, z) < 200) return 'Downtown';
      if (x > 220) return 'Sunset Row';
      if (x < -300) return 'Westside';
      return z < -250 ? 'South Gardens' : z > 250 ? 'North Shore' : 'Midtown';
    },
    streetNameAt(x, z) {
      if (onPier(x, z)) return 'Southline Pier';
      if (onBoardwalk(x, z)) return 'Coral Boardwalk';
      const r = roadGraph.nearestEdge(x, z);
      return r && r.dist < 14 ? r.edge.name : null;
    },
    benches: benchList, leanSpots, walls: leanSpots,
    shopLots: SHOP_LOTS.map((l) => ({ ...l })), // empty, collider-free lots for walk-in stores
    storefronts: SHOP_LOTS.map((l, i) => ({ x: l.x, z: l.z, y: l.y, w: l.w, d: l.d, facing: l.facing, kind: l.zone, buildingId: null, id: i })),
    update() {}, // old map is fully resident: nothing to stream
    trafficLight: (axis) => tLight(axis), // 'x' | 'z' road axis -> 'green'|'yellow'|'red'
    root,
  };
  return city;
}

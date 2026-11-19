// Nico's house r8 (SPEC r8, references A, E, F, B, D): the water side, in the house frame H (r4/plan4.js).
//  - the bay bulkhead along the house's NW side (z = wallZ): weathered vertical-plank timber wall with whaler, cap and king piles, the
//    white two-rail fence on it with a gap where the dock leaves, a metal ladder, the life ring on a post;
//  - the CANAL: 6 m of water between timber bulkheads from the bay (NW end) in toward the SE, straight, a dead end past the house; the
//    lower deck sits flush with its house-side wall; chain-link on the neighbor's side; the white fence on Nico's side where the deck
//    is not. Its water is drawn here: the world's ground raster is too coarse for a 6 m channel, so a depth "portal" (an invisible
//    lid at the wall tops that resets depth) clears whatever the terrain drew inside the channel, then the walls' water faces, the
//    bed and a calm, clear dark-teal water surface (animated normals, darker toward the walls) draw into it;
//  - the DOCK (A): a walkway that leaves the bay wall at an angle by the canal mouth, turns, and runs straight along the wall to the big
//    flat platform: pilings, cross-braces, cleats, the KEEP OFF / NO ENTRY sign on its post, the swim ladder, two chairs (a green
//    folding camp chair, a white resin chair), the cooler, coiled rope, the life ring, the fishing rod lying down, the tackle box,
//    and the skiff moored along the platform (the boat system's real skiff replaces the library boat when it is up).
import { R8, P4 } from '../r4/plan4.js';
import { frame } from '../r4/frame.js';
import { makeGeo } from '../r4/geo.js';
import { loadKeysModels } from '../models.js';
export const order = 6;

export function build(ctx) {
  if (!R8) return;
  const { THREE, kit, mat } = ctx,
    Fr = frame(ctx, 'site'),
    B = kit.batch('r8wat'),
    D = kit.batch('r8watD'),
    M = kit.M,
    P = P4,
    r = kit.rng(806),
    sea = ctx.plan.seaY;
  const { lathe } = makeGeo(THREE, kit);
  const W = mat.wood({ marine: true }),
    WD = mat.wood(),
    WHITE = mat.paint({ peel: 'a', fade: 0.55, gloss: 0.85 }),
    ST = mat.steel();
  const box = (m, sx, sy, sz, x, y, z, o = {}, rx = 0, ry = 0, rz = 0, Bt = B) =>
    Bt.box(m, sx, sy, sz, M(x, y, z, rx, ry, rz), { bevel: 0.006, rand: r, ...o });
  const gray = (k = 1) => kit.vary(kit.mul(0x9c8f7c, k), r, 0.1);
  const Cn = P.canal,
    Wz = P.wallZ,
    bed = sea - 2.6;
  const yard = (x, z) => (ctx.yardY ? ctx.yardY(...Fr.toG(x, z)) : 0);
  // everything of the water side draws after the depth portal (renderOrder 61): WG holds the loaded models, the batches go there too
  const WG = new THREE.Group();
  WG.name = 'r8_waterside';
  WG.userData.nhLodMin = 70;
  Fr.groups.detail.add(WG); // r10: the dock's props draw with the dock (no late pop-in)
  const late = (o) => {
    o.traverse((n) => {
      if (n.isMesh || n.isInstancedMesh) n.renderOrder = 61;
    });
    return o;
  };
  const ground = (x, z) => (ctx.opts.groundAt ? ctx.opts.groundAt(...Fr.toG(x, z)) : 0);
  // the wall top: the yard surface beside the wall on Nico's side, the terrain on the neighbor's side
  // the canal's portal height: just over the highest ground inside the channel (the world's coarse ground still runs across it) and
  // over the yard at its edges; every canal wall top reaches at least this high, so a ray through the portal always ends inside the
  // lined channel (walls, bed, water), which is redrawn after it
  let lidY = -9;
  if (Cn.on)
    for (let x = Cn.x0 - 0.5; x <= Cn.x1 + 0.51; x += 0.75)
      for (let z = P.wallZ - 0.5; z <= Cn.z1 + 0.51; z += 0.75)
        lidY = Math.max(
          lidY,
          ground(x, z) + 0.03,
          x < Cn.x0 + 0.1 || x > Cn.x1 - 0.1 ? yard(x, z) + 0.06 : -9,
        );
  let capC = sea + 0.03;
  if (Cn.on)
    for (let z = P.wallZ; z <= Cn.z1; z += 1)
      for (const x of [Cn.x0 - 0.4, Cn.x1 + 0.4]) capC = Math.max(capC, yard(x, z) + 0.1);
  const inC = (x, z) =>
    Cn.on && x > Cn.x0 - 0.8 && x < Cn.x1 + 0.8 && z > P.wallZ - 0.8 && z < Cn.z1 + 0.8;
  const topAt = (x, z, far) => {
    const t = yard(x, z) + 0.06;
    void far;
    return inC(x, z) ? Math.max(t, lidY) : t;
  };
  // a run of bulkhead from (ax, az) to (bx, bz); n = unit normal toward the water; planks on the land side of the line
  const CI = kit.batch('r8canalIn'); // the canal's inside (drawn after the depth portal)
  const wallRun = (ax, az, bx, bz, nx, nz, o = {}) => {
    const L = Math.hypot(bx - ax, bz - az),
      ux = (bx - ax) / L,
      uz = (bz - az) / L,
      ry = Math.atan2(-uz, ux),
      at = (t, off) => [ax + ux * t - nx * off, az + uz * t - nz * off],
      pw = 0.235;
    for (let t = 0; t < L - 0.01; t += pw) {
      const tm = Math.min(L, t + pw / 2),
        [x, z] = at(tm, 0.03),
        top = topAt(...at(tm, 0.5), o.far) + (r() - 0.5) * 0.03,
        h = top - bed;
      box(
        W,
        Math.min(pw, L - t) - 0.006,
        h,
        0.06,
        x,
        bed + h / 2,
        z,
        { grain: 1, color: gray(0.78 + r() * 0.3), wear: 0.9, bevel: 0.008 },
        (r() - 0.5) * 0.008,
        ry,
        (r() - 0.5) * 0.008,
      );
    }
    for (let t = 0; t < L - 0.1; t += 2.4) {
      const t1 = Math.min(L, t + 2.4),
        tm = (t + t1) / 2,
        top = topAt(...at(tm, 0.5), o.far),
        [wx, wz] = at(tm, -0.05),
        [cx, cz] = at(tm, 0.12),
        [px, pz] = at(t, -0.2);
      box(
        W,
        t1 - t - 0.01,
        0.2,
        0.1,
        wx,
        top - 0.22,
        wz,
        { grain: 0, color: gray(0.7), wear: 0.9 },
        0,
        ry,
        0,
        o.inCanal ? CI : B,
      );
      box(
        WD,
        t1 - t - 0.01,
        0.06,
        0.3,
        cx,
        top + 0.03,
        cz,
        { grain: 0, color: gray(0.95), wear: 0.7, bevel: 0.01 },
        0,
        ry,
      );
      box(
        W,
        0.2,
        top + 0.02 - bed,
        0.2,
        px,
        (top + 0.02 + bed) / 2,
        pz,
        { grain: 1, color: gray(0.68), wear: 1, bevel: 0.02 },
        0,
        ry,
        0,
        o.inCanal ? CI : B,
      );
    }
    const [mx, mz] = at(L / 2, 0.12),
      tm = topAt(mx, mz, o.far);
    Fr.col.box(mx, (tm + bed) / 2, mz, L + 0.1, tm - bed + 0.2, 0.3, { ry, tag: 'seawall' });
    // the canal's inner faces again, drawn after the portal (the planks above keep their color, these guarantee the channel is lined)
    if (o.inCanal) {
      const [lx, lz] = at(L / 2, -0.005),
        tt = Math.max(lidY, capC) + 0.002;
      box(
        W,
        L + 0.02,
        tt - bed,
        0.02,
        lx,
        (tt + bed) / 2,
        lz,
        { grain: 1, color: gray(0.7), wear: 0.95, uvS: 0.235 },
        0,
        ry,
        0,
        CI,
      );
    }
    return { L, ux, uz, ry, at };
  };
  const fence = (ax, az, bx, bz, nx, nz, o = {}) => {
    const L = Math.hypot(bx - ax, bz - az),
      ux = (bx - ax) / L,
      uz = (bz - az) / L,
      ry = Math.atan2(-uz, ux),
      fo = 0.45,
      n = Math.max(1, Math.round(L / 2.0)),
      at = (t) => [ax + ux * t - nx * fo, az + uz * t - nz * fo];
    if (o.chain) {
      const CH = mat.art(
        'r8chain',
        128,
        128,
        (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.strokeStyle = 'rgba(170,172,168,1)';
          g.lineWidth = 3;
          for (let k = -h; k < w + h; k += 16) {
            g.beginPath();
            g.moveTo(k, 0);
            g.lineTo(k + h, h);
            g.stroke();
            g.beginPath();
            g.moveTo(k + h, 0);
            g.lineTo(k, h);
            g.stroke();
          }
        },
        { rough: 0.6 },
      );
      CH.transparent = true;
      CH.alphaTest = 0.4;
      CH.side = THREE.DoubleSide;
      CH.userData.uvScale = 0.25;
      for (let i = 0; i <= n; i++) {
        const [x, z] = at((L * i) / n),
          y0 = topAt(x, z, o.far) - 0.06;
        D.cyl(ST, 0.025, 0.025, 1.25, M(x, y0 + 0.62, z), { color: 0x9c9e9a, seg: 8 });
      }
      const [mx, mz] = at(L / 2),
        y0 = topAt(mx, mz, o.far) - 0.06;
      D.cyl(ST, 0.016, 0.016, L, M(mx, y0 + 1.2, mz, 0, ry, Math.PI / 2), {
        color: 0x9c9e9a,
        seg: 8,
      });
      box(CH, L, 1.1, 0.004, mx, y0 + 0.62, mz, { color: 0xffffff, bevel: 0 }, 0, ry, 0, D);
      Fr.col.box(mx, y0 + 0.6, mz, L, 1.2, 0.1, { ry, tag: 'fence' });
      return;
    }
    for (let i = 0; i <= n; i++) {
      const [x, z] = at((L * i) / n),
        y0 = topAt(x, z, o.far) - 0.06;
      box(
        WHITE,
        0.1,
        1.02,
        0.1,
        x,
        y0 + 0.47,
        z,
        { grain: 1, color: kit.vary(0xe9e6dc, r, 0.03), wear: 0.45, bevel: 0.01 },
        0,
        ry,
      );
      box(WHITE, 0.13, 0.03, 0.13, x, y0 + 0.995, z, { color: 0xeeebe2, wear: 0.4 }, 0, ry);
    }
    for (let i = 0; i < n; i++) {
      const t0 = (L * i) / n + 0.05,
        t1 = (L * (i + 1)) / n - 0.05,
        [x, z] = [
          ax + (ux * (t0 + t1)) / 2 - nx * (fo - 0.07),
          az + (uz * (t0 + t1)) / 2 - nz * (fo - 0.07),
        ],
        y0 = topAt(x, z, o.far) - 0.06;
      for (const y of [0.88, 0.45])
        box(
          WHITE,
          t1 - t0,
          0.09,
          0.04,
          x,
          y0 + y,
          z,
          { grain: 0, color: kit.vary(0xe9e6dc, r, 0.03), wear: 0.45 },
          0,
          ry,
        );
    }
    const [mx, mz] = at(L / 2);
    Fr.col.box(mx, topAt(mx, mz, o.far) + 0.45, mz, L, 1.0, 0.12, { ry, tag: 'fence' });
  };

  // ---------- the bay bulkhead and its fence (A): Nico's stretch to the canal mouth, the neighbor's beyond it ----------
  const dk = P.dock,
    gap = [dk.wallX - 0.95, dk.wallX + 0.95];
  wallRun(P.wallX0, Wz, Cn.x0, Wz, 0, -1);
  wallRun(Cn.x1, Wz, Cn.x1 + 18, Wz, 0, -1, { far: true });
  fence(P.wallX0 + 0.3, Wz, gap[0], Wz, 0, -1);
  fence(gap[1], Wz, Cn.x0 - 0.45, Wz, 0, -1);
  // ---------- the canal (straight, 6 m): Nico's wall (the lower deck flush with it), the dead end, the neighbor's wall ----------
  if (Cn.on) {
    wallRun(Cn.x0, Wz, Cn.x0, Cn.z1, 1, 0, { inCanal: true });
    wallRun(Cn.x0, Cn.z1, Cn.x1, Cn.z1, 0, -1, { inCanal: true });
    wallRun(Cn.x1, Cn.z1, Cn.x1, Wz, -1, 0, { inCanal: true, far: true });
    // fences: white two-rail on Nico's side where the deck and its stair are not, chain-link on the neighbor's side and across the end
    fence(Cn.x0, Wz + 0.45, Cn.x0, 0.85, 1, 0);
    fence(Cn.x0, 2.15, Cn.x0, Cn.z1 - 0.45, 1, 0); // r10: along the whole wall (the turned house's gym deck stands back from it now), a gate gap at the ladder
    fence(Cn.x1, Cn.z1 - 0.3, Cn.x1, Wz + 0.6, -1, 0, { chain: true, far: true });
    fence(Cn.x0 + 0.4, Cn.z1, Cn.x1 - 0.4, Cn.z1, 0, -1, { chain: true });
    // a ladder down Nico's canal wall, by the lower deck's stair
    {
      const lz = 1.5,
        lx = Cn.x0 + 0.1,
        top = yard(Cn.x0 - 0.4, lz) + 0.04;
      for (const s of [-1, 1])
        CI.tube(
          ST,
          [
            [lx, sea - 1.0, lz + s * 0.22],
            [lx, top, lz + s * 0.22],
            [lx - 0.15, top + 0.35, lz + s * 0.22],
            [lx - 0.4, top + 0.35, lz + s * 0.22],
            [lx - 0.55, top, lz + s * 0.22],
          ],
          0.022,
          { seg: 10, color: 0xb9bab6, steps: 40, tension: 0.2 },
        );
      for (let y2 = sea - 0.8; y2 < top; y2 += 0.3)
        CI.cyl(ST, 0.016, 0.016, 0.44, M(lx, y2, lz, Math.PI / 2, 0, 0), {
          color: 0xb9bab6,
          seg: 10,
        });
    }
    // ---- the water: depth portal (lid), canal bed, surface ----
    const x0 = Cn.x0,
      x1 = Cn.x1,
      z0 = Wz - 0.6,
      z1 = Cn.z1;
    // the portal: an invisible plane over the channel at lidY that writes no color and the far depth, drawn after the world (renderOrder
    // 60); the channel's lining, bed and water (renderOrder 61) then draw where the coarse ground had been
    ctx.r8portal = true;
    ctx.r8lidY = lidY;
    // bed: dark silt, a few rocks (seen only through the water's color near the walls)
    {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
      g.rotateX(-Math.PI / 2);
      CI.geo(
        mat.pbr('sand_01', { rep: 5, gain: 0.8, grunge: true }),
        g,
        M((x0 + x1) / 2, bed + 0.3, (z0 + z1) / 2),
        { color: [0.32, 0.36, 0.3], uvMul: [2, 12] },
      );
      g.dispose();
    }
    // r12: no lid collider over the water any more: the canal is real water in the world (canal.js: swim, bed, no land)
    ctx.r8canalBatch = CI;
  }
  // ---------- the depth portal and the water of the bay strip ----------
  // The world's ground raster is too coarse for the 6 m canal and (until the map is rebuilt with the r8 carve) still runs as beach
  // past the bay bulkhead. An invisible lid that follows the world's ground 3 cm over it (never under the water + 2 cm) and writes no
  // color but the far depth is drawn over the channel and the bay strip after the world (renderOrder 60); the lining, the bed, the
  // dock and the water (renderOrder 61) then draw into it. Where the world already has water the lid sits on the water and changes
  // nothing visible. Feathered beyond the strip so the water meets the world's sea without a seam.
  {
    const bayLand = [-20, -10, 0, 8, 25].some(
      (x) => !(ctx.opts.waterAt && ctx.opts.waterAt(...Fr.toG(x, Wz - 2.5))),
    );
    const lidM = new THREE.ShaderMaterial({
      vertexShader:
        'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); gl_FragDepth = 1.0; }',
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    lidM.name = 'r8waterPortal';
    const lidGrid = (x0, x1, z0, z1, step, floor) => {
      const nx = Math.max(1, Math.ceil((x1 - x0) / step)),
        nz = Math.max(1, Math.ceil((z1 - z0) / step)),
        g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++)
        pa.setY(i, Math.max(ground(pa.getX(i), pa.getZ(i)) + 0.03, floor));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, lidM);
      m.renderOrder = 60;
      m.castShadow = m.receiveShadow = false;
      m.frustumCulled = false;
      m.raycast = () => {};
      m.name = 'r8_water_portal';
      Fr.groups.ext.add(m);
    };
    const BX = { x0: P.wallX0, x1: Cn.x1 + 18, z0: Wz - 22, z1: Wz };
    // the canal's portal is flat at the bulkhead caps: it also clears the yard ground and decals that reach over the channel's line
    void lidGrid;
    void capC; // r8: no depth portal (it stopped clearing depth in the current render pipeline); the surface follows the ground instead
    // the water: one surface over the canal and (when the world has beach there) the bay strip; opaque, 12 mm over the sea plane
    const WM = new THREE.MeshStandardMaterial({
      color: 0x1d5a57,
      roughness: 0.06,
      metalness: 0.0,
      envMapIntensity: 1.15,
      vertexColors: true,
    });
    WM.name = 'r8water';
    const WF = new THREE.MeshStandardMaterial({
      color: 0x1d5a57,
      roughness: 0.06,
      metalness: 0.0,
      envMapIntensity: 1.15,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    WF.name = 'r8waterFeather';
    WF.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <color_pars_vertex>',
          '#include <color_pars_vertex>\nattribute float aA; varying float vA;',
        )
        .replace('#include <color_vertex>', '#include <color_vertex>\nvA = aA;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <color_pars_fragment>',
          '#include <color_pars_fragment>\nvarying float vA;',
        )
        .replace(
          '#include <dithering_fragment>',
          '#include <dithering_fragment>\ngl_FragColor.a *= vA;',
        );
    };
    // the normal map is assigned up front (no program change when it arrives: the perf shader gate queues each object once)
    {
      const t = new THREE.TextureLoader().load(
        (import.meta.env?.BASE_URL ?? '/') + 'assets/env/waternormals.jpg',
      );
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(0.2, 0.2);
      for (const m of [WM, WF]) {
        m.normalMap = t;
        m.normalScale.set(0.16, 0.16);
      }
      ctx.updaters.push((dt) => {
        t.offset.x = (t.offset.x + dt * 0.002) % 1;
        t.offset.y = (t.offset.y - dt * 0.0035) % 1;
      });
    }
    // darker toward the walls (shade, depth): k(x, z) from the distance to the nearest bulkhead
    const shade = (x, z) => {
      const inCn = x > Cn.x0 && x < Cn.x1 && z > Wz - 0.5;
      const d = inCn ? Math.min(x - Cn.x0, Cn.x1 - x, Cn.z1 - z) : Math.max(0, Wz - z);
      return 0.58 + 0.42 * Math.min(1, d / 2.2);
    };
    const sheet = (x0, x1, z0, z1, step, mat, alpha, yFn) => {
      const nx = Math.max(1, Math.ceil((x1 - x0) / step)),
        nz = Math.max(1, Math.ceil((z1 - z0) / step)),
        g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, sea + 0.012, (z0 + z1) / 2);
      const pa = g.attributes.position,
        col = new Float32Array(pa.count * 3),
        al = new Float32Array(pa.count),
        uv = g.attributes.uv;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i),
          z = pa.getZ(i),
          k = shade(x, z);
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
        al[i] = alpha ? alpha(x, z) : 1;
        uv.setXY(i, x, z);
        pa.setY(i, yFn ? yFn(x, z) : Math.max(sea + 0.012, ground(x, z) + 0.06));
      } /* r8: the surface rides 6 cm over the world's coarse ground where that stands above the sea (no depth tricks) */
      pa.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aA', new THREE.BufferAttribute(al, 1));
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = mat.transparent ? 62 : 61;
      m.receiveShadow = true;
      m.castShadow = false;
      m.raycast = () => {};
      m.name = mat.name;
      Fr.groups.ext.add(m);
      return m;
    };
    if (Cn.on) {
      const CM = canalWaterMaterial(THREE, WM.normalMap, Cn, Wz, sea, ctx);
      // one flat surface over the world's coarse ground under the channel (land where the map is not carved yet, its bank strip
      // ~5 cm under the sea where it is, the street's turning circle at the far end): 8 cm over the highest of it, never under
      // 10 cm over the sea, never over 30 cm
      let lvl = sea + 0.1;
      for (let x = Cn.x0 + 0.3; x < Cn.x1; x += 0.75)
        for (let z = Wz; z < Cn.z1 + 0.5; z += 0.75) lvl = Math.max(lvl, ground(x, z) + 0.08);
      lvl = Math.min(lvl, sea + 0.3);
      const m = sheet(Cn.x0, Cn.x1, Wz - 0.01, Cn.z1, 0.75, CM, null, () => lvl);
      m.onBeforeRender = (rd, sc, cam) => {
        CM.userData.camL
          .copy(cam.position)
          .applyMatrix4(CM.userData.inv.copy(m.matrixWorld).invert());
      };
    }
    if (bayLand) {
      sheet(BX.x0, BX.x1, BX.z0, BX.z1, 1.5, WM);
      const F8 = 8,
        fa = (x, z) => {
          const dx = Math.max(BX.x0 - x, x - BX.x1, 0),
            dz = Math.max(BX.z0 - z, 0);
          return Math.max(0, 1 - Math.hypot(dx, dz) / F8);
        };
      sheet(BX.x0 - F8, BX.x1 + F8, BX.z0 - F8, BX.z0, 1.5, WF, fa);
      sheet(BX.x0 - F8, BX.x0, BX.z0, BX.z1, 1.5, WF, fa);
      sheet(BX.x1, BX.x1 + F8, BX.z0, BX.z1, 1.5, WF, fa);
    }
    ctx.stats.r8water = { bayLand, canal: Cn.on };
  }
  // a metal ladder down the bay wall, right of the platform (A)
  {
    const lx = -9.0,
      top = yard(lx, Wz + 0.4) + 0.1;
    for (const s of [-1, 1])
      D.tube(
        ST,
        [
          [lx + s * 0.22, sea - 1.0, Wz - 0.1],
          [lx + s * 0.22, top, Wz - 0.1],
          [lx + s * 0.22, top + 0.35, Wz + 0.05],
          [lx + s * 0.22, top + 0.35, Wz + 0.3],
          [lx + s * 0.22, top, Wz + 0.45],
        ],
        0.022,
        { seg: 10, color: 0xb9bab6, steps: 40, tension: 0.2 },
      );
    for (let y = sea - 0.8; y < top; y += 0.3)
      D.cyl(ST, 0.016, 0.016, 0.44, M(lx, y, Wz - 0.1, 0, 0, Math.PI / 2), {
        color: 0xb9bab6,
        seg: 10,
      });
  }

  // ---------- the dock (A): angled gangway off the wall, the straight walk along the wall, the platform ----------
  const y = Math.min(-0.15, sea + 0.4),
    pl = P.plat,
    zA = dk.z - dk.w / 2,
    zB = dk.z + dk.w / 2,
    pilesAt = [];
  const pile = (x, z, top) => {
    const rr = 0.12 + r() * 0.03,
      h = top - bed,
      lean = (r() - 0.5) * 0.03;
    B.cyl(W, rr * 0.92, rr, h, M(x, top - h / 2, z, lean, r() * 6, lean * 0.7), {
      seg: 14,
      hseg: 6,
      color: kit.vary(0x847a6c, r, 0.12),
      wear: 1,
    });
    lathe(
      B,
      W,
      [
        [0.001, 0],
        [rr * 0.92, 0],
        [rr * 0.85, 0.03],
        [rr * 0.5, 0.07],
        [0.001, 0.08],
      ],
      M(x, top, z),
      { color: kit.vary(0x9a9083, r, 0.1), seg: 14 },
    );
    Fr.col.cyl(x, (top + bed) / 2, z, rr + 0.02, top - bed, { tag: 'pile' });
    pilesAt.push([x, z, top]);
  };
  // boards across the walking direction, stringers under them, one collider per stretch (a sloped one for the gangway)
  const stretch = (ax, az, ay, bx, bz, by, w) => {
    const L = Math.hypot(bx - ax, bz - az),
      ux = (bx - ax) / L,
      uz = (bz - az) / L,
      ry = Math.atan2(-uz, ux),
      sl = Math.atan2(by - ay, L),
      pitch = 0.152;
    for (let t = pitch / 2; t < L - 0.03; t += pitch) {
      const tone = r() < 0.05 ? kit.vary(0xbfa77e, r, 0.06) : gray(0.85 + r() * 0.3),
        yy = ay + ((by - ay) * t) / L;
      box(
        WD,
        0.142,
        0.045,
        w - (r() - 0.5) * 0.03,
        ax + ux * t,
        yy - 0.022 + (r() - 0.5) * 0.006,
        az + uz * t,
        { grain: 2, color: tone, wear: 0.5 + r() * 0.5, bevel: 0.007 },
        0,
        ry + (r() - 0.5) * 0.01,
        sl,
      );
    }
    const nS = Math.max(2, Math.round(w / 0.6) + 1);
    for (let i = 0; i < nS; i++) {
      const o = -w / 2 + 0.05 + ((w - 0.1) * i) / (nS - 1),
        px = -uz * o,
        pz = ux * o;
      B.strut(W, [ax + px, ay - 0.145, az + pz], [bx + px, by - 0.145, bz + pz], 0.06, 0.2, {
        color: gray(0.6),
        wear: 0.9,
        roll: Math.PI / 2,
      });
    }
    Fr.col.boxQ(
      [(ax + bx) / 2, (ay + by) / 2 - 0.15, (az + bz) / 2],
      [L / 2 + 0.05, 0.15, w / 2],
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, sl, 'YXZ')),
      { tag: 'dock', surface: 'wood' },
    );
    return { L, ux, uz };
  };
  const yW = yard(dk.wallX, Wz + 0.3) + 0.06; // the wall cap
  // r9 (user): ONE long angled gangway from the wall cap straight onto the platform's wall-side corner (no knee, no second run); its last
  // boards lie 12 mm over the platform's where they overlap (no z-fighting)
  // r10 (playtest Nov 19: "one purposeful, connected structure, smooth joints to the seawall"): a straight pier square to the wall from the
  // fence gap to the middle of the platform's wall side. It starts ON the wall cap (a level landing across the cap with a header beam on the
  // wall's face), then one even ramp down to the platform; the ramp's last boards lie 12 mm over the platform's (no z-fighting)
  const capW = 0.5,
    zL0 = Wz + capW,
    zL1 = Wz - 0.25;
  stretch(dk.wallX, zL0, yW, dk.wallX, zL1, yW, dk.w);
  box(W, dk.w + 0.3, 0.24, 0.1, dk.wallX, yW - 0.17, Wz - 0.07, {
    grain: 0,
    color: gray(0.62),
    wear: 0.9,
  }); // header on the wall face
  const gE = [dk.wallX, pl.z1 - 0.3];
  const g1 = stretch(dk.wallX, zL1, yW - 0.005, gE[0], gE[1], y + 0.012, dk.w),
    g2 = null;
  // stringer ends sit in steel hangers on the header (the joint reads as built, not stacked)
  for (const sx of [-1, 1])
    box(ST, 0.07, 0.2, 0.12, dk.wallX + sx * (dk.w / 2 - 0.1), yW - 0.17, zL1 + 0.02, {
      color: 0x6f706c,
      bevel: 0.004,
    });
  // a fascia board round the platform and along the pier's sides: one finished edge for the whole dock
  {
    const fas = (ax, az, bx, bz, ya, yb) => {
      const L = Math.hypot(bx - ax, bz - az),
        ry = Math.atan2(-(bz - az), bx - ax);
      box(
        W,
        L,
        0.16,
        0.035,
        (ax + bx) / 2,
        (ya + yb) / 2 - 0.1,
        (az + bz) / 2,
        { grain: 0, color: gray(0.7), wear: 0.8 },
        0,
        ry,
        Math.atan2(yb - ya, L) * (Math.abs(bx - ax) > Math.abs(bz - az) ? 1 : 0),
      );
    };
    fas(pl.x0 - 0.02, pl.z0 - 0.02, pl.x1 + 0.02, pl.z0 - 0.02, y, y);
    fas(pl.x0 - 0.02, pl.z1 + 0.02, dk.wallX - dk.w / 2, pl.z1 + 0.02, y, y);
    fas(dk.wallX + dk.w / 2, pl.z1 + 0.02, pl.x1 + 0.02, pl.z1 + 0.02, y, y);
    fas(pl.x0 - 0.02, pl.z0, pl.x0 - 0.02, pl.z1, y, y);
    fas(pl.x1 + 0.02, pl.z0, pl.x1 + 0.02, pl.z1, y, y);
  }
  // the platform: boards run toward the house (A)
  {
    const pitch = 0.152;
    for (let x = pl.x0 + pitch / 2; x < pl.x1 - 0.03; x += pitch) {
      const tone = r() < 0.05 ? kit.vary(0xbfa77e, r, 0.06) : gray(0.85 + r() * 0.3);
      box(
        WD,
        0.142,
        0.045,
        pl.z1 - pl.z0 - (r() - 0.5) * 0.03,
        x,
        y - 0.022 + (r() - 0.5) * 0.005,
        (pl.z0 + pl.z1) / 2,
        { grain: 2, color: tone, wear: 0.5 + r() * 0.5, bevel: 0.007 },
        0,
        (r() - 0.5) * 0.008,
      );
    }
    for (const z of [pl.z0 + 0.06, (pl.z0 + pl.z1) / 2, pl.z1 - 0.06])
      box(W, pl.x1 - pl.x0, 0.22, 0.07, (pl.x0 + pl.x1) / 2, y - 0.155, z, {
        grain: 0,
        color: gray(0.6),
        wear: 0.9,
      });
    Fr.col.box(
      (pl.x0 + pl.x1) / 2,
      y - 0.15,
      (pl.z0 + pl.z1) / 2,
      pl.x1 - pl.x0,
      0.3,
      pl.z1 - pl.z0,
      { tag: 'dock', surface: 'wood' },
    );
  }
  // piles: along the walk on both sides, the platform's corners and mid edges (taller at the front), the knee, the gangway's foot
  {
    const L = g1.L,
      px = -g1.uz,
      pz = g1.ux;
    for (let t = L / 2; t < L - 0.6; t += 2.4) {
      const cx = dk.wallX + g1.ux * t,
        cz = zL1 + g1.uz * t,
        yy = yW - 0.04 + ((y - yW + 0.04) * t) / L;
      for (const sd of [-1, 1])
        pile(
          cx + px * sd * (dk.w / 2 + 0.14),
          cz + pz * sd * (dk.w / 2 + 0.14),
          yy + (sd < 0 && r() < 0.4 ? 0.45 : 0.06),
        );
    }
  }
  for (const [x, z, h] of [
    [pl.x0 - 0.1, pl.z0 - 0.1, 0.95],
    [pl.x1 + 0.1, pl.z0 - 0.1, 0.95],
    [pl.x0 - 0.1, pl.z1 + 0.1, 0.4],
    [(pl.x0 + pl.x1) / 2, pl.z0 - 0.1, 0.95],
    [pl.x0 - 0.1, (pl.z0 + pl.z1) / 2, 0.2],
    [pl.x1 + 0.1, (pl.z0 + pl.z1) / 2 - 0.6, 0.2],
  ])
    pile(x, z, y + h);
  // cross-braces under the platform's front and the walk (A: diagonal 2x8s between the piles)
  const brace = (a, b) =>
    B.strut(W, [a[0], y - 0.25, a[1]], [b[0], bed + 1.2, b[1]], 0.05, 0.18, {
      color: gray(0.55),
      wear: 1,
      rand: r,
    });
  brace([pl.x0 - 0.1, pl.z0 - 0.18], [(pl.x0 + pl.x1) / 2, pl.z0 - 0.18]);
  brace([pl.x1 + 0.1, pl.z0 - 0.18], [(pl.x0 + pl.x1) / 2, pl.z0 - 0.18]);
  // cleats, the swim ladder at the platform's front, coiled rope
  const cleat = (x, z, ry) => {
    box(ST, 0.26, 0.025, 0.045, x, y + 0.07, z, { color: 0xa9a69c, bevel: 0.01 }, 0, ry);
    for (const s of [-1, 1])
      D.cyl(
        ST,
        0.015,
        0.02,
        0.05,
        M(x + Math.cos(ry) * s * 0.06, y + 0.03, z - Math.sin(ry) * s * 0.06),
        { color: 0xa9a69c, seg: 10 },
      );
  };
  cleat(pl.x0 + 0.9, pl.z0 + 0.12, 0);
  cleat(pl.x0 + 4.1, pl.z0 + 0.12, 0);
  {
    const lx = pl.x0 + 4.5,
      lz = pl.z0 - 0.02;
    for (const s of [-1, 1])
      D.tube(
        ST,
        [
          [lx + s * 0.2, sea - 1.1, lz - 0.05],
          [lx + s * 0.2, y + 0.02, lz - 0.05],
          [lx + s * 0.2, y + 0.55, lz + 0.1],
          [lx + s * 0.2, y + 0.02, lz + 0.35],
        ],
        0.02,
        { seg: 10, color: 0xc2c3bf, steps: 36, tension: 0.15 },
      );
    for (let yy = sea - 0.9; yy < y - 0.1; yy += 0.3)
      box(ST, 0.4, 0.03, 0.06, lx, yy, lz - 0.05, { color: 0xb8b9b5 });
  }
  const ROPE = mat.fabric('wool_boucle', { rep: 0.05 });
  const coil = (x, z, col) => {
    const pts = [];
    for (let i = 0; i < 120; i++) {
      const t = i / 120,
        a2 = t * 6.283 * 6,
        rr = 0.08 + t * 0.2;
      pts.push([x + Math.cos(a2) * rr, y + 0.02 + (i % 20) * 0.0006, z + Math.sin(a2) * rr]);
    }
    D.tube(ROPE, pts, 0.013, { seg: 6, color: col, steps: 200 });
  };
  coil(pl.x0 + 0.8, pl.z1 - 0.8, 0xd9d2b8);
  coil(pl.x1 - 0.9, pl.z1 - 0.7, 0x4f86a6);
  // the KEEP OFF / NO ENTRY sign on its post at the platform's back corner by the wall (A)
  {
    const sx = pl.x1 - 0.35,
      sz = pl.z1 - 0.25,
      top = y + 2.7;
    B.cyl(W, 0.07, 0.08, top - bed, M(sx, (top + bed) / 2, sz), {
      seg: 12,
      color: kit.vary(0x847a6c, r, 0.1),
      wear: 1,
    });
    Fr.col.cyl(sx, (top + bed) / 2, sz, 0.09, top - bed, { tag: 'pole' });
    const SIGN = mat.art(
      'r8keepoff',
      512,
      320,
      (g, w, h) => {
        g.fillStyle = '#f1efe8';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#2a2a2a';
        g.lineWidth = 12;
        g.strokeRect(14, 14, w - 28, h - 28);
        g.fillStyle = '#1e1e1e';
        g.font = kit.font(96, 800, 'Arial Black, Helvetica, sans-serif');
        g.textAlign = 'center';
        g.fillText('KEEP OFF', w / 2, 140);
        g.fillText('NO ENTRY', w / 2, 255);
        const q = kit.rng(9);
        for (let i = 0; i < 500; i++) {
          g.fillStyle = `rgba(120,100,70,${q() * 0.14})`;
          g.fillRect(q() * w, q() * h, 2 + q() * 6, 1 + q() * 3);
        }
      },
      { rough: 0.6 },
    );
    B.box(SIGN, 0.66, 0.42, 0.012, M(sx, y + 2.25, sz - 0.1), { bevel: 0.002 });
    box(mat.metalPaint(), 0.68, 0.44, 0.01, sx, y + 2.25, sz - 0.088, { color: 0xdedbd2 });
    for (const yy of [y + 2.12, y + 2.38])
      box(ST, 0.12, 0.02, 0.06, sx, yy, sz - 0.05, { color: 0x9a9a96 });
  }
  // the life ring on the gangway's wall post (A: red ring at the start of the walk)
  {
    const lx = gap[0] - 0.15,
      lz = Wz + 0.55,
      top = yard(lx, lz) + 1.15;
    const RING = mat.paint({ peel: 'a', fade: 0.3, gloss: 0.7, scale: 0.4 });
    D.geo(RING, new THREE.TorusGeometry(0.27, 0.06, 10, 28), M(lx, top - 0.05, lz - 0.09), {
      color: 0xc8352a,
    });
    for (let k = 0; k < 4; k++)
      D.geo(
        RING,
        new THREE.TorusGeometry(0.27, 0.0615, 10, 4, 0.3),
        M(lx, top - 0.05, lz - 0.09, 0, 0, (k * Math.PI) / 2 + 0.6),
        { color: 0xeeeae0 },
      );
  }
  Fr.anchor('dock', (pl.x0 + pl.x1) / 2, y, (pl.z0 + pl.z1) / 2, Math.PI);
  Fr.anchor('dockHead', (pl.x0 + pl.x1) / 2, y, pl.z0 + 0.6, Math.PI);
  // ---------- library pieces: chairs, fishing gear, cooler, the skiff ----------
  const lib = loadKeysModels(THREE, ['fishing_gear', 'coolers', 'skiff_cc']);
  const boat = { x: (pl.x0 + pl.x1) / 2 + 0.2, z: pl.z0 - 1.5, h: Math.PI / 2 };
  Fr.anchor('skiff', boat.x, sea, boat.z, boat.h);
  ctx.async.push(
    lib.ready.then(() => {
      const I = lib.instancer('r8dock');
      // a white resin chair and a green folding camp chair on the platform, facing the water (A)
      {
        const x = pl.x0 + 3.2,
          z = pl.z0 + 1.7;
        ctx.async.push(
          kit.model('plastic_monobloc_chair_01').then((m) => {
            if (!m) return;
            m.position.set(x, y, z);
            m.rotation.y = Math.PI + 0.25;
            m.traverse((o) => {
              if (o.isMesh) {
                o.raycast = () => {};
                if (o.material) {
                  o.material.roughness = Math.max(0.55, o.material.roughness ?? 0.5);
                  o.material.envMapIntensity = 0.5;
                }
              }
            });
            WG.add(late(m));
          }),
        );
        Fr.col.box(x, y + 0.42, z, 0.56, 0.84, 0.56, { tag: 'prop' });
      }
      {
        const x = pl.x0 + 1.9,
          z = pl.z0 + 1.6,
          CAMP = mat.fabric('denim_fabric', { rep: 0.3 }),
          FR2 = mat.steel(),
          a = Math.PI + 0.2,
          c = Math.cos(a),
          s = Math.sin(a),
          L2 = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
        for (const [dx0, dz0, dx1, dz1] of [
          [-0.25, -0.25, 0.25, 0.25],
          [0.25, -0.25, -0.25, 0.25],
          [-0.25, 0.25, 0.25, -0.25],
          [0.25, 0.25, -0.25, -0.25],
        ]) {
          const [ax, az] = L2(dx0, dz0),
            [bx, bz] = L2(dx1 * 0.9, dz1 * 0.9);
          D.rod(FR2, [ax, y, az], [bx, y + 0.45, bz], 0.011, { color: 0x2a2a2a });
        }
        const [cx, cz] = L2(0, 0.0),
          [bx2, bz2] = L2(0, 0.26);
        box(CAMP, 0.5, 0.03, 0.45, cx, y + 0.45, cz, { color: 0x2f5e3c, bevel: 0.01 }, 0, a, 0, D);
        box(
          CAMP,
          0.5,
          0.45,
          0.03,
          bx2,
          y + 0.7,
          bz2,
          { color: 0x2f5e3c, bevel: 0.01 },
          -0.18,
          a,
          0,
          D,
        );
        Fr.col.box(x, y + 0.4, z, 0.6, 0.8, 0.6, { tag: 'prop' });
      }
      ctx.anchors.dockChair = {
        pos: Fr.v(pl.x0 + 3.2, y, pl.z0 + 1.7),
        heading: Math.PI + 0.25 + Fr.th - 0.72,
      };
      for (const [n, dx, dz, a] of [
        ['tackle_box', 2.5, 0.9, 0.3],
        ['plastic_bucket_full', 3.6, 1.1, 1.0],
      ])
        I.add('fishing_gear', n, M(pl.x0 + dx, y, pl.z0 + dz, 0, a, 0));
      const cn = lib.names('coolers');
      if (cn.length)
        I.add('coolers', cn[0], M(pl.x0 + 3.9, y, pl.z0 + 2.4, 0, 0.4, 0), {
          tint: [1.2, 1.05, 0.5],
        }); // a yellow cooler (A)
      const meshes = I.build(WG);
      for (const m of meshes) {
        m.raycast = () => {};
        m.renderOrder = 61;
      }
      // the rod lies on the boards beside the tackle box, reel down, tip toward the water
      {
        const tx = pl.x0 + 2.4,
          tz = pl.z0 + 0.6;
        const p = lib.piece('fishing_gear', 'fishing_pole');
        if (p) {
          const g = new THREE.Group();
          g.name = 'r8rod';
          const bb = new THREE.Box3();
          for (const q of p.parts) {
            q.geometry.computeBoundingBox();
            bb.union(q.geometry.boundingBox);
          }
          const sz = new THREE.Vector3();
          bb.getSize(sz);
          const inner = new THREE.Group();
          g.add(inner);
          if (sz.y >= sz.x && sz.y >= sz.z) inner.rotation.z = -Math.PI / 2;
          else if (sz.z > sz.x) inner.rotation.y = Math.PI / 2;
          for (const q of p.parts) {
            const m = new THREE.Mesh(q.geometry, q.material);
            m.castShadow = true;
            m.raycast = () => {};
            inner.add(m);
          }
          inner.updateMatrixWorld(true);
          const wb = new THREE.Box3().setFromObject(inner);
          g.position.set(
            tx - (wb.min.x + wb.max.x) / 2,
            y - wb.min.y + 0.002,
            tz - (wb.min.z + wb.max.z) / 2,
          );
          g.rotation.y = 0.15;
          WG.add(late(g));
        }
      }
      // the skiff moored along the platform's front (the boat system's drivable skiff replaces it when that is up: nicoHouse.v2.js)
      const p = lib.piece('skiff_cc', 'dock');
      if (p) {
        const g = new THREE.Group();
        g.name = 'r4skiff';
        const ext = new THREE.Vector3();
        p.box.getSize(ext);
        const long = ext.x > ext.z ? 'x' : 'z';
        const inner = new THREE.Group();
        if (long === 'z') inner.rotation.y = Math.PI / 2;
        g.add(inner);
        for (const q of p.parts) {
          let mm = q.material;
          if (/blue/i.test(mm.name || '')) {
            mm = mm.clone();
            mm.color.setRGB(0.02, 0.02, 0.022);
            mm.name += ':r8black';
          }
          if (/red/i.test(mm.name || '')) {
            mm = mm.clone();
            mm.color.setRGB(0.12, 0.12, 0.12);
          }
          const m = new THREE.Mesh(q.geometry, mm);
          m.castShadow = false;
          m.receiveShadow = true;
          m.raycast = () => {};
          inner.add(m);
        }
        g.position.set(boat.x, sea - 0.42, boat.z);
        g.rotation.y = boat.h - Math.PI / 2;
        Fr.groups.dyn.add(late(g));
        const ph = r() * 6.28;
        ctx.updaters.push(() => {
          const t = performance.now() / 1000;
          g.position.y = sea - 0.42 + Math.sin(t * 0.9 + ph) * 0.03;
          g.rotation.z = Math.sin(t * 0.7 + ph) * 0.02;
        });
        const tb = kit.batch('r8lines');
        for (const [cx, cz, dx] of [
          [pl.x0 + 0.9, pl.z0 + 0.12, -2.4],
          [pl.x0 + 4.1, pl.z0 + 0.12, 2.2],
        ]) {
          const a2 = [cx, y + 0.08, cz],
            b2 = [boat.x + dx, sea + 0.55, boat.z + 0.35],
            pts = [];
          for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            pts.push([
              a2[0] + (b2[0] - a2[0]) * t,
              a2[1] + (b2[1] - a2[1]) * t - 0.25 * 4 * t * (1 - t),
              a2[2] + (b2[2] - a2[2]) * t,
            ]);
          }
          tb.tube(ROPE, pts, 0.011, { seg: 5, color: 0xd6cfb4 });
        }
        late(tb.build(WG, { cast: false }).reduce((g, m) => (g.add(m), g), new THREE.Group()));
      }
    }),
  );
  void g1;
  void g2;
  void pilesAt;
  // the canal's inside: built after the portal (renderOrder 61)
  for (const m of [
    ...CI.build(Fr.groups.ext),
    ...B.build(Fr.groups.ext),
    ...D.build(Fr.groups.detail),
  ]) {
    m.renderOrder = 61;
    m.userData.nhLodMin = 70;
  }
  Fr.build();
}

// r12 (user: "look real and deeper, a sandy silty bottom, darker and murkier with depth"): the canal's water is opaque (the
// world's coarse ground still runs under it), so the bottom is drawn INTO the surface: per pixel the view ray is refracted at the
// surface and marched down to the bed profile (canal.js canalDepth, the same one the bed collider uses) or a wall; the hit is shaded
// (rippled sand, silt by the walls, a few rocks and shells, soft caustics; weathered planks with algae lower down) and the
// water absorbs it along the path (red first), fading to a dark green murk. Reflections and the ripple normals stay the
// standard material's.
function canalWaterMaterial(THREE, normalMap, Cn, Wz, sea, ctx) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.05,
    metalness: 0,
    envMapIntensity: 1.0,
    // the street's asphalt (junction units -7) reaches a little over the channel's end: the water wins there
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -12,
  });
  m.name = 'r12canalWater';
  m.normalMap = normalMap;
  m.normalScale = new THREE.Vector2(0.07, 0.07);
  const U = {
    uCamL: { value: new THREE.Vector3() },
    uR: { value: new THREE.Vector4(Cn.x0, Cn.x1, Wz, Cn.z1) },
    uSea: { value: sea },
    uT: { value: 0 },
  };
  m.userData.camL = U.uCamL.value;
  m.userData.inv = new THREE.Matrix4();
  ctx.updaters.push((dt) => {
    U.uT.value += dt;
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCL;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCL = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCL;\nuniform vec3 uCamL;\nuniform vec4 uR;\nuniform float uSea;\nuniform float uT;',
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + CANAL_GLSL);
  };
  m.customProgramCacheKey = () => 'r12canalWater';
  return m;
}

const CANAL_GLSL = /* glsl */ `
{
  vec3 V = normalize(vCL - uCamL);
  vec3 Rd = refract(V, vec3(0.0, 1.0, 0.0), 0.75);
  Rd.y = min(Rd.y, -0.08);
  Rd = normalize(Rd);
  vec3 p = vCL;
  float L = 0.0, hit = 0.0, dwH = 0.0;
  for (int i = 0; i < 40; i++) {
    float st = 0.1 + L * 0.06;
    p += Rd * st;
    L += st;
    float dw = min(min(p.x - uR.x, uR.y - p.x), uR.w - p.z);
    if (dw < 0.0 && p.z > uR.z) { hit = 2.0; break; }
    float t = clamp(dw / 4.0, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    float n = sin(p.x * 0.9 + p.z * 0.37) * sin(p.z * 0.61 - p.x * 0.23);
    if (p.y < uSea - (2.0 + 0.5 * t + 0.08 * n)) { hit = 1.0; dwH = max(dw, 0.0); break; }
  }
  vec3 col = vec3(0.0);
  if (hit > 1.5) {
    // the bulkhead below the waterline: vertical planks, algae lower down
    float along = (abs(p.x - uR.x) < 0.4 || abs(p.x - uR.y) < 0.4) ? p.z : p.x;
    float f = fract(along / 0.235);
    col = vec3(0.3, 0.26, 0.2) * (0.72 + 0.28 * smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.92, f));
    col = mix(col, vec3(0.15, 0.21, 0.11), smoothstep(uSea - 0.5, uSea - 1.6, p.y));
  } else if (hit > 0.5) {
    vec2 q = p.xz;
    float rip = sin(dot(q, vec2(1.9, 2.9)) + 1.3 * sin(q.x * 0.45 + q.y * 0.3)) * 0.5 + 0.5;
    col = vec3(0.66, 0.6, 0.47) * (0.8 + 0.2 * rip);
    col = mix(col, vec3(0.33, 0.31, 0.24), (1.0 - smoothstep(0.0, 2.2, dwH)) * 0.8);
    vec2 cell = floor(q * 0.9), fr = fract(q * 0.9) - 0.5;
    float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453), h2 = fract(h * 91.7);
    float d = length(fr - (vec2(h, h2) - 0.5) * 0.6);
    if (h > 0.9) col = mix(col, vec3(0.3, 0.29, 0.27), smoothstep(0.17, 0.11, d));
    else if (h > 0.85) col = mix(col, vec3(0.88, 0.84, 0.76), smoothstep(0.06, 0.03, d));
    float ca = sin(q.x * 2.3 + uT * 1.1 + sin(q.y * 1.7)) * sin(q.y * 2.1 - uT * 0.9 + sin(q.x * 1.3));
    col *= 1.0 + 0.35 * pow(abs(ca), 3.0);
  }
  vec3 tr = exp(-L * vec3(1.05, 0.56, 0.5));
  diffuseColor.rgb = col * 0.6 * tr + vec3(0.012, 0.05, 0.046) * (1.0 - tr);
}
`;

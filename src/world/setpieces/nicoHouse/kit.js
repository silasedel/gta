// Nico's house: shared build kit (track: nico-house).
// Geometry batching (every board is its own beveled box, merged per material), PBR material library with wear shaders
// (peeling paint over weathered wood, rusting galvanized tin, marine growth at the waterline), canvas texture helpers,
// collider / interaction descriptors. Pure: needs only THREE. Everything is in house-local meters
// (+X east, +Z south = the street side, Y up, yard grade y = 0).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function createKit(THREE, opts = {}) {
  const base = (opts.assetBase ?? ((import.meta.env?.BASE_URL ?? '/') + 'assets/setpieces/nicoHouse/'));
  const maxAniso = opts.anisotropy ?? 8;
  const seaY = opts.seaY ?? -1.0;
  const kit = { THREE, base, seaY, opts };

  // ---------- random ----------
  kit.rng = (seed = 1) => { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  kit.hash = (a, b = 0, c = 0) => { let h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); };

  // ---------- colors ----------
  const _c = new THREE.Color();
  // hex (sRGB) or [r,g,b] linear -> [r,g,b] linear
  kit.rgb = (c) => { if (Array.isArray(c)) return c; _c.set(c ?? 0xffffff); return [_c.r, _c.g, _c.b]; };
  kit.mul = (c, k) => { const a = kit.rgb(c); return [a[0] * k, a[1] * k, a[2] * k]; };
  kit.mix = (c1, c2, t) => { const a = kit.rgb(c1), b = kit.rgb(c2); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  // small per-piece variation around a color (value and a touch of hue)
  kit.vary = (c, r, amt = 0.08) => { const a = kit.rgb(c), k = 1 + (r() - 0.5) * 2 * amt, h = (r() - 0.5) * amt * 0.5; return [a[0] * (k + h), a[1] * k, a[2] * (k - h)]; };

  // ---------- transforms ----------
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  kit.M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
  kit.mulM = (...ms) => { const m = ms[0].clone(); for (let i = 1; i < ms.length; i++) m.multiply(ms[i]); return m; };
  // matrix that puts a unit +Y axis from point a to point b (for struts, braces, ropes); returns { m, len }
  kit.span = (a, b, roll = 0) => {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(); d.normalize();
    // deterministic frame: local X = horizontal, perpendicular to the strut; local Z = in the strut's vertical plane
    const x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d); if (x.lengthSq() < 1e-8) x.set(1, 0, 0); x.normalize();
    const z = new THREE.Vector3().crossVectors(x, d), m = new THREE.Matrix4().makeBasis(x, d, z);
    if (roll) m.multiply(new THREE.Matrix4().makeRotationY(roll));
    m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return { m, len };
  };

  // ---------- textures ----------
  const loader = new THREE.TextureLoader(), texCache = new Map();
  kit.pending = [];
  kit.tex = (file, o = {}) => {
    const key = file + '|' + (o.srgb ? 1 : 0) + '|' + (o.repeat ? o.repeat.join(',') : '');
    if (texCache.has(key)) return texCache.get(key);
    let done; kit.pending.push(new Promise((r) => { done = r; }));
    const t = loader.load(base + 'tex/' + file, () => done(), undefined, () => { console.warn('[nicoHouse] texture missing', file); done(); });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
    if (o.srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
    texCache.set(key, t); return t;
  };
  kit.canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); return c; };
  kit.canvasTex = (w, h, draw, o = {}) => {
    const t = new THREE.CanvasTexture(kit.canvas(w, h, draw));
    t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  // fine tileable value noise (for micro roughness / bump on plastics, metals, glass grime)
  const noiseCanvas = (n, seed, octs = [[n, 1]], contrast = 1) => kit.canvas(n, n, (g) => {
    const r = kit.rng(seed), img = g.createImageData(n, n), acc = new Float32Array(n * n); let tot = 0;
    for (const [f, amp] of octs) {
      const gN = Math.max(2, Math.round(f)), grid = new Float32Array(gN * gN); for (let i = 0; i < grid.length; i++) grid[i] = r();
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const fx = x / n * gN, fy = y / n * gN, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (x0 + 1) % gN, y1 = (y0 + 1) % gN;
        const a = grid[y0 * gN + x0], b = grid[y0 * gN + x1], c = grid[y1 * gN + x0], d = grid[y1 * gN + x1];
        acc[y * n + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
      }
      tot += amp;
    }
    for (let i = 0; i < n * n; i++) { const v = Math.max(0, Math.min(1, ((acc[i] / tot) - 0.5) * contrast + 0.5)) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  });
  kit.noiseCanvas = noiseCanvas;
  let _micro, _scratch;
  kit.microTex = () => (_micro ||= (() => { const t = new THREE.CanvasTexture(noiseCanvas(256, 5, [[128, 1], [32, 0.8], [8, 0.6]], 1.5)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t; })());
  kit.scratchTex = () => (_scratch ||= kit.canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, w, h); const r = kit.rng(9);
    for (let i = 0; i < 900; i++) { g.strokeStyle = `rgba(${r() > 0.5 ? 255 : 40},${r() > 0.5 ? 255 : 40},${r() > 0.5 ? 255 : 40},${0.05 + r() * 0.22})`; g.lineWidth = 0.4 + r() * 1.3; const x = r() * w, y = r() * h, a = r() * 6.28, l = 6 + r() * r() * 110; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() * 255 | 0},${r() * 255 | 0},${r() * 255 | 0},${r() * 0.2})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  }, { srgb: false }));

  // ---------- shader extension helper ----------
  // ext: { key, uniforms, vpars, vmain, fpars, map (replaces map+color chunks), rough (replaces roughnessmap chunk), metal, normal, tail }
  kit.extend = (mat, ext) => {
    mat.userData.ext = ext;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, ext.uniforms || {});
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWear;\nvarying float vWear;\nvarying vec3 vNhPos;\n' + (ext.vpars || ''))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWear = aWear;\nvNhPos = position;\n' + (ext.vmain || ''));
      let f = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWear;\nvarying vec3 vNhPos;\nuniform sampler2D uGrunge;\n' + (ext.fpars || ''));
      if (ext.map) f = f.replace('#include <map_fragment>', ext.map).replace('#include <color_fragment>', '');
      if (ext.rough) f = f.replace('#include <roughnessmap_fragment>', ext.rough);
      if (ext.metal) f = f.replace('#include <metalnessmap_fragment>', ext.metal);
      if (ext.tail) f = f.replace('#include <dithering_fragment>', ext.tail + '\n#include <dithering_fragment>');
      if (ext.indirect) { f = f.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n  reflectedLight.indirectDiffuse *= uNhIndirect; reflectedLight.indirectSpecular *= uNhIndirect;\n').replace('uniform sampler2D uGrunge;', 'uniform sampler2D uGrunge;\nuniform float uNhIndirect;'); sh.uniforms.uNhIndirect = kit.uIndirect; }
      sh.fragmentShader = f;
      sh.uniforms.uGrunge = { value: kit.tex('grunge.png') };
    };
    mat.customProgramCacheKey = () => 'nh:' + ext.key + (ext.indirect ? ':i' : '');
    return mat;
  };
  const GRUNGE = 'vec3 nhG = texture2D( uGrunge, vNhPos.xy * 0.085 + vNhPos.zz * vec2( 0.061, 0.097 ) ).rgb;\n  vec3 nhG2 = texture2D( uGrunge, vNhPos.xz * 0.31 + vNhPos.yy * 0.23 ).rgb;\n';
  // algae / wet band around the waterline + salt bleaching above it; uses local Y (uSeaY) so it follows the tide if the host moves it
  const MARINE = `
  { float nhH = vNhPos.y - uSeaY;
    float nhWet = smoothstep( 0.55, 0.05, nhH + ( nhG.r - 0.5 ) * 0.25 );
    float nhAlg = smoothstep( 0.42, -0.05, nhH + ( nhG2.r - 0.5 ) * 0.3 ) * smoothstep( -1.6, -0.3, nhH );
    float nhBarn = smoothstep( 0.6, 0.75, nhG2.b ) * smoothstep( 0.35, 0.0, abs( nhH - 0.12 ) );
    diffuseColor.rgb *= mix( 1.0, 0.42, nhWet );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.045, 0.075, 0.03 ), nhAlg * 0.75 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.62, 0.6, 0.55 ), nhBarn * 0.8 );
    nhWetness = nhWet; }
`;

  // ---------- materials ----------
  const M = new Map();
  // Interior variants: inside the house the sky / hemisphere / environment light is scaled down (kit.uIndirect) so rooms are lit
  // by the sun through the windows and by their own lamps. Use kit.imat.<factory>(...) (same factories as kit.mat) for interior parts.
  kit.uIndirect = { value: opts.interiorAmbient ?? 0.4 };
  let interiorMode = false;
  kit.setIndirect = (m) => { if (m.userData.ext) m.userData.ext.indirect = true; else kit.extend(m, { key: 'plain', indirect: true }); m.needsUpdate = true; return m; };
  const memo = (key, make) => { const k = interiorMode ? key + '|int' : key; if (!M.has(k)) { const m = make(); m.name = k; if (interiorMode) kit.setIndirect(m); M.set(k, m); } return M.get(k); };
  kit.uSeaY = { value: seaY };
  const mat = kit.mat = {};
  const pbrSet = (id, rep) => ({ map: kit.tex(id + '_diff.jpg', { srgb: true, repeat: rep }), normalMap: kit.tex(id + '_nor_gl.jpg', { repeat: rep }), roughnessMap: kit.tex(id + '_rough.jpg', { repeat: rep }) });

  // Weathered bare wood. Vertex color tints it (white = silver-gray sun-bleached lumber). o.marine adds the waterline band.
  mat.wood = (o = {}) => memo('wood' + (o.marine ? ':m' : '') + (o.dark ? ':d' : ''), () => {
    const m = new THREE.MeshStandardMaterial({ ...pbrSet('rough_wood'), vertexColors: true, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.1, 1.1) });
    m.userData.uvScale = 0.75;
    return kit.extend(m, {
      key: 'wood' + (o.marine ? 'm' : ''), uniforms: { uSeaY: kit.uSeaY }, fpars: 'uniform float uSeaY;\n',
      map: `
  float nhWetness = 0.0;
  { vec4 nhT = texture2D( map, vMapUv );
    ${GRUNGE}
    vec3 nhC = mix( vec3( 1.0 ), nhT.rgb * vec3( 6.67, 7.94, 10.1 ), 0.92 ) * vColor.rgb;   // scan normalized to mean 1, so the tint is the final albedo
    nhC *= 0.8 + 0.4 * nhG.r;                                     // big sun / damp blotches
    nhC = mix( nhC, nhC * vec3( 0.62, 0.66, 0.6 ), nhG.g * vWear ); // rain streaks, stronger on worn pieces
    diffuseColor.rgb = nhC;
    ${o.marine ? MARINE : ''} }
`,
      rough: 'float roughnessFactor = roughness;\n  roughnessFactor = clamp( 0.5 + 0.55 * texture2D( roughnessMap, vRoughnessMapUv ).g, 0.0, 1.0 );   // r2-art: weathered boards 0.75-0.85\n  roughnessFactor = mix( roughnessFactor, 0.22, nhWetness * 0.8 );\n',
    });
  });

  // Painted wood with peeling paint. Vertex color = paint color; aWear 0..1 = how much has flaked off (per board / per vertex).
  // o: { peel:'a'|'b', fade: 0..1 sun-bleach, gloss: paint roughness, scale: peel pattern size }
  mat.paint = (o = {}) => memo(`paint:${o.peel || 'a'}:${o.fade ?? 0.3}:${o.gloss ?? 0.72}:${o.scale ?? 1}:${o.marine ? 1 : 0}`, () => {
    const m = new THREE.MeshStandardMaterial({ ...pbrSet('rough_wood'), vertexColors: true, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.85, 0.85) });
    m.userData.uvScale = 0.75;
    return kit.extend(m, {
      key: m.uuid.slice(0, 8), fpars: 'uniform sampler2D uPeel;\nuniform float uSeaY;\n',
      uniforms: { uPeel: { value: kit.tex(`peel_${o.peel || 'a'}.png`) }, uSeaY: kit.uSeaY },
      map: `
  float nhPaint = 1.0; float nhWetness = 0.0;
  { vec4 nhT = texture2D( map, vMapUv );
    ${GRUNGE}
    float nhPeel = texture2D( uPeel, vMapUv * ${(1.35 / (o.scale ?? 1)).toFixed(3)} ).r;
    float nhW = clamp( vWear + ( nhG.r - 0.5 ) * 0.34 + ( nhG2.r - 0.5 ) * 0.14, 0.0, 1.0 );
    float nhThr = 0.04 + 0.78 * pow( nhW, 1.6 );
    // flicker fix (Nov 17): the flake edge used a fixed 0.05-wide step, far sharper than a pixel once the boards are a few meters
    // away, so the peel spots aliased into crawling dots under the TAA jitter. The step now widens with the screen-space rate of
    // change of the pattern (fwidth), and fades toward the average coverage when even that is sub-pixel.
    float nhPw = max( 0.025, fwidth( nhPeel ) * 1.2 + fwidth( nhThr ) );
    nhPaint = smoothstep( nhThr - nhPw, nhThr + nhPw, nhPeel );
    nhPaint = mix( nhPaint, clamp( 1.0 - nhThr * 1.15, 0.0, 1.0 ), smoothstep( 0.12, 0.35, nhPw ) );
    float nhLum = dot( nhT.rgb * vec3( 6.67, 7.94, 10.1 ), vec3( 0.3333 ) ) * 0.5;
    vec3 nhBare = nhT.rgb * vec3( 6.67, 7.94, 10.1 ) * vec3( 0.33, 0.285, 0.235 ) * ( 0.72 + 0.45 * nhG.r ) * ( 1.0 - 0.45 * nhG.g );   // silver-gray sun-bleached lumber
    nhBare *= 1.0 - 0.3 * smoothstep( nhThr - 0.14, nhThr, nhPeel ) * ( 1.0 - nhPaint );   // grime that sat under the lifted flake
    vec3 nhP = vColor.rgb;
    float nhFade = ${(o.fade ?? 0.3).toFixed(3)} * ( 0.35 + 0.65 * nhG.r );
    nhP = mix( nhP, vec3( dot( nhP, vec3( 0.3333 ) ) ) * 1.12 + 0.04, nhFade );          // chalky sun-bleach
    nhP *= 0.74 + 0.62 * nhLum;                                                            // grain telegraphing through thin paint
    nhP = mix( nhP, nhP * vec3( 0.62, 0.47, 0.36 ), clamp( nhG.g * ( 0.45 + nhW ) * 1.1, 0.0, 0.85 ) );   // rust and tannin runs from nails and sills                                            // rain and rust streaks
    nhP *= 1.0 - 0.10 * nhG2.b;                                                            // mildew specks
    nhP *= 1.0 - 0.18 * smoothstep( nhThr + 0.10, nhThr, nhPeel );                         // dirty rim along flake edges
    diffuseColor.rgb = mix( nhBare, nhP, nhPaint );
    ${o.marine ? MARINE : ''} }
`,
      rough: `float roughnessFactor = roughness;\n  roughnessFactor *= texture2D( roughnessMap, vRoughnessMapUv ).g;\n  roughnessFactor = mix( roughnessFactor, ${(o.gloss ?? 0.72).toFixed(3)}, nhPaint * 0.9 );\n  roughnessFactor = mix( roughnessFactor, 0.22, nhWetness * 0.8 );\n`,
    });
  });

  // Galvanized corrugated tin with rust streaks. uv: x = meters across (+ random per sheet), y = 0 at the top of the sheet .. 1 at the eave.
  mat.tin = () => memo('tin', () => {
    const m = new THREE.MeshStandardMaterial({ map: kit.tex('corrugated_iron_diff.jpg', { srgb: true }), roughnessMap: kit.tex('corrugated_iron_rough.jpg'), vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 0.9, side: THREE.DoubleSide });
    m.userData.uvScale = 1;
    return kit.extend(m, {
      key: 'tin', fpars: 'uniform sampler2D uRust;\nuniform sampler2D uTinWear;\n',
      uniforms: { uRust: { value: kit.tex('rusty_metal_04_diff.jpg', { srgb: true }) }, uTinWear: { value: kit.tex('tin_wear.png') } },
      map: `
  float nhRust = 0.0;
  { vec3 nhGalv = texture2D( map, vMapUv * vec2( 1.1, 3.1 ) ).rgb;
    vec3 nhWr = texture2D( uTinWear, vec2( vMapUv.x * 0.31, vMapUv.y ) ).rgb;
    vec3 nhRc = texture2D( uRust, vMapUv * vec2( 0.9, 2.3 ) ).rgb;
    ${GRUNGE}
    float nhAge = vWear;
    nhRust = clamp( nhWr.r * ( 0.55 + 1.5 * nhAge ) + nhWr.b * ( 0.6 + nhAge ) + ( nhG.r - 0.62 ) * nhAge * 1.3, 0.0, 1.0 );
    nhRust = smoothstep( 0.22, 0.62, nhRust );
    vec3 nhZn = mix( vec3( dot( nhGalv, vec3( 0.2126, 0.7152, 0.0722 ) ) ), nhGalv, 0.2 ) * 3.2 * vColor.rgb * ( 0.82 + 0.3 * nhWr.g );   // r2-art: galvanized zinc L 0.45-0.6, near neutral
    nhZn = mix( nhZn, nhZn * vec3( 1.0, 0.93, 0.82 ), nhG.g * 0.5 );                 // tan run-off staining
    diffuseColor.rgb = mix( nhZn, nhRc * vec3( 0.95, 0.72, 0.6 ), nhRust );
  }
`,
      rough: 'float roughnessFactor = roughness;\n  roughnessFactor *= texture2D( roughnessMap, vRoughnessMapUv * vec2( 1.1, 3.1 ) ).g;\n  roughnessFactor = mix( clamp( roughnessFactor * 0.6 + 0.2, 0.0, 1.0 ), 0.9, nhRust );\n',
      metal: 'float metalnessFactor = metalness * ( 1.0 - nhRust ) * 0.92;\n',
    });
  });

  // Generic CC0 PBR set (vertex color tints it). o: { rep: meters per tile, rough, metal, marine, tint, side, nscale }
  mat.pbr = (id, o = {}) => memo(`pbr:${id}:${o.rep ?? 1}:${o.marine ? 1 : 0}:${o.metal ?? 0}:${o.side ?? 0}:${o.tint ?? ''}:${o.env ?? ''}:${o.gain ?? ''}:${o.grunge ? 1 : 0}:${o.rlift ?? ''}:${o.nscale ?? ''}`, () => {
    const m = new THREE.MeshStandardMaterial({ ...pbrSet(id), vertexColors: true, roughness: o.rough ?? 1, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide });
    if (o.tint != null) m.color.set(o.tint);
    if (o.gain) m.color.multiplyScalar(o.gain);
    if (o.nscale != null) m.normalScale.set(o.nscale, o.nscale);
    if (o.env != null) m.envMapIntensity = o.env;
    m.userData.uvScale = o.rep ?? 1;
    if (!o.marine && !o.grunge) return m;
    return kit.extend(m, {
      key: 'pbr' + id + (o.marine ? 'm' : 'g'), uniforms: { uSeaY: kit.uSeaY }, fpars: 'uniform float uSeaY;\n',
      map: `
  float nhWetness = 0.0;
  { ${GRUNGE}
    vec4 nhT = texture2D( map, vMapUv );
    diffuseColor.rgb *= nhT.rgb * vColor.rgb * ( 0.82 + 0.36 * nhG.r );   // diffuseColor already carries material.color (tint x gain)
    diffuseColor.rgb *= 1.0 - 0.3 * nhG.g * vWear;
    ${o.marine ? MARINE : ''} }
`,
      rough: 'float roughnessFactor = roughness;\n  roughnessFactor *= texture2D( roughnessMap, vRoughnessMapUv ).g;\n' + (o.rlift ? `  roughnessFactor = mix( roughnessFactor, 1.0, ${o.rlift.toFixed(3)} );\n` : '') + '  roughnessFactor = mix( roughnessFactor, 0.2, nhWetness * 0.8 );\n',
    });
  });

  // Vertex-colored "finish" materials so many differently colored small parts share a draw call. All carry micro detail (no flat surfaces).
  const finish = (key, p) => memo('fin:' + key, () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
    m.userData.uvScale = p.uvScale ?? 0.25; delete m.uvScale; return m;
  });
  mat.plastic = () => finish('plastic', { roughness: 0.62, metalness: 0, roughnessMap: kit.scratchTex(), bumpMap: kit.microTex(), bumpScale: 0.6 });
  mat.plasticGloss = () => finish('plasticGloss', { roughness: 0.32, metalness: 0, roughnessMap: kit.scratchTex(), bumpMap: kit.microTex(), bumpScale: 0.25 });
  mat.rubber = () => finish('rubber', { roughness: 0.95, metalness: 0, roughnessMap: kit.scratchTex(), bumpMap: kit.microTex(), bumpScale: 1.2 });
  mat.metalPaint = () => finish('metalPaint', { roughness: 0.5, metalness: 0.25, roughnessMap: kit.scratchTex(), bumpMap: kit.microTex(), bumpScale: 0.3 });   // enamel-painted steel
  mat.steel = () => finish('steel', { roughness: 0.42, metalness: 1, roughnessMap: kit.scratchTex(), bumpMap: kit.microTex(), bumpScale: 0.35, envMapIntensity: 1.1 });    // galvanized / stainless (color tints)
  mat.chrome = () => finish('chrome', { roughness: 0.14, metalness: 1, roughnessMap: kit.scratchTex(), envMapIntensity: 1.3 });
  mat.ceramic = () => finish('ceramic', { roughness: 0.2, metalness: 0, roughnessMap: kit.scratchTex(), bumpMap: kit.microTex(), bumpScale: 0.12 });
  mat.matte = () => finish('matte', { roughness: 0.9, metalness: 0, bumpMap: kit.microTex(), bumpScale: 0.8 });                                   // paper, cardboard, unglazed
  // r2-art calibration: rust is dielectric (metal 0, rough ~0.8, L <= 0.18); concrete near neutral (sat <= 0.2), rough ~0.85, softer normals
  mat.rust = (o = {}) => mat.pbr('rusty_metal_04', { rep: o.rep ?? 0.6, metal: 0, grunge: true, rlift: 0.55, gain: 0.85 });
  mat.rustLight = (o = {}) => mat.pbr('rusty_metal_02', { rep: o.rep ?? 0.8, metal: 0, grunge: true, rlift: 0.6, gain: 0.7 });
  mat.concrete = (o = {}) => mat.pbr('concrete_wall_008', { rep: o.rep ?? 1.6, marine: o.marine, grunge: true, gain: 2.3, tint: 0xe2e9f6, nscale: 0.7, rlift: 0.4 });
  mat.fabric = (id = 'cotton_jersey', o = {}) => mat.pbr(id, { rep: o.rep ?? 0.35, side: o.side });
  mat.glass = (o = {}) => memo('glass:' + (o.tint ?? 0) + ':' + (o.dirt ?? 1), () => {
    const dirt = kit.canvasTex(512, 512, (g, w, h) => {                       // salt haze, wiped arcs, drip marks, dusty corners
      const r = kit.rng(31); g.fillStyle = 'rgba(190,205,205,0.10)'; g.fillRect(0, 0, w, h);
      const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, 'rgba(210,220,215,0.05)'); lg.addColorStop(0.75, 'rgba(210,220,215,0.16)'); lg.addColorStop(1, 'rgba(215,215,200,0.5)'); g.fillStyle = lg; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const x = r() * w, y0 = r() * h * 0.7, l = 30 + r() * 220; const sg = g.createLinearGradient(0, y0, 0, y0 + l); sg.addColorStop(0, 'rgba(225,230,225,0)'); sg.addColorStop(0.3, `rgba(225,230,225,${0.08 + r() * 0.16})`); sg.addColorStop(1, 'rgba(225,230,225,0)'); g.fillStyle = sg; g.fillRect(x, y0, 1.5 + r() * 4, l); }
      for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(235,238,232,${r() * 0.22})`; g.beginPath(); g.arc(r() * w, r() * h, 0.4 + r() * 1.6, 0, 6.3); g.fill(); }
      for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) { const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 170); rg.addColorStop(0, 'rgba(200,196,180,0.5)'); rg.addColorStop(1, 'rgba(200,196,180,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); }
    });
    return new THREE.MeshPhysicalMaterial({ map: dirt, color: 0xffffff, transparent: true, roughness: 0.06, metalness: 0, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
  });
  // image / label material from a canvas draw function (posters, labels, screens). o: { emissive, rough, w, h, key, transparent }
  mat.art = (key, w, h, draw, o = {}) => memo('art:' + key, () => {
    const t = kit.canvasTex(w, h, draw, { repeat: false });
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: o.rough ?? 0.75, metalness: 0, transparent: !!o.transparent, alphaTest: o.alphaTest ?? 0, side: o.side ?? THREE.FrontSide, bumpMap: o.flat ? null : kit.microTex(), bumpScale: 0.3 });
    if (o.emissive) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = t; m.emissiveIntensity = o.emissive; }
    m.userData.uvScale = 0; return m;
  });
  mat.emissive = (hex, intensity = 2, key = '') => memo('em:' + hex + ':' + key, () => { const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: intensity, roughness: 0.4 }); m.userData.uvScale = 1; return m; });
  kit.imat = new Proxy(mat, { get: (t, p) => (typeof t[p] === 'function' ? (...a) => { const was = interiorMode; interiorMode = true; try { return t[p](...a); } finally { interiorMode = was; } } : t[p]) });
  kit.materials = M;

  // ---------- geometry batch ----------
  // Collects boxes / arbitrary geometries per material and merges each bucket into one mesh.
  // Attributes: position, normal, uv (meters / material.userData.uvScale), color (linear rgb), aWear (float).
  const FACES = [ // normal axis, sign, u axis, v axis
    [0, 1, 2, 1], [0, -1, 2, 1], [1, 1, 0, 2], [1, -1, 0, 2], [2, 1, 0, 1], [2, -1, 0, 1],
  ];
  class Batch {
    constructor(name = 'batch') { this.name = name; this.b = new Map(); }
    bucket(m) { let k = this.b.get(m); if (!k) { k = { pos: [], nor: [], uv: [], col: [], wear: [], idx: [], n: 0 }; this.b.set(m, k); } return k; }
    // Box centered at the origin of matrix m4, size sx,sy,sz.
    // o: { grain: 0|1|2 axis the wood grain follows (default: longest), color, wear | [wearBottom, wearTop], bevel, uv: [u0,v0] offset,
    //      shade: [bottom, top] color multipliers along local Y, skip: 'px,nx,py,ny,pz,nz' faces to omit, uvS: override uvScale, rand: fn }
    box(m, sx, sy, sz, m4, o = {}) {
      const k = this.bucket(m), s = [sx / 2, sy / 2, sz / 2];
      const grain = o.grain ?? (sx >= sy && sx >= sz ? 0 : sy >= sz ? 1 : 2);
      const S = o.uvS ?? m.userData.uvScale ?? 1, col = kit.rgb(o.color), bev = Math.min(o.bevel ?? 0, s[0] * 0.9, s[1] * 0.9, s[2] * 0.9);
      const r = o.rand, u0 = o.uv ? o.uv[0] : (r ? r() * 7 : kit.hash(k.n, sx, sz) * 7), v0 = o.uv ? o.uv[1] : (r ? r() * 7 : kit.hash(sy, k.n, 3) * 7);
      const w0 = Array.isArray(o.wear) ? o.wear[0] : (o.wear ?? 0.3), w1 = Array.isArray(o.wear) ? o.wear[1] : w0;
      const sh0 = o.shade ? o.shade[0] : 1, sh1 = o.shade ? o.shade[1] : 1;
      const e = m4.elements, base = k.n, skip = o.skip || '';
      const names = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
      const vid = new Int32Array(48).fill(-1); // [face][corner] -> vertex index
      for (let f = 0; f < 6; f++) {
        if (skip.includes(names[f])) continue;
        const [na, sg, ua, va] = FACES[f];
        for (let c = 0; c < 4; c++) {
          const su = (c === 0 || c === 3) ? -1 : 1, sv = c < 2 ? -1 : 1;
          const p = [0, 0, 0]; p[na] = sg * s[na]; p[ua] = su * (s[ua] - bev); p[va] = sv * (s[va] - bev);
          // uv in meters: v follows the grain when the grain lies in this face
          let uu, vv;
          if (grain === ua) { vv = p[ua]; uu = p[va] + (f + 1) * 0.37; } else if (grain === va) { vv = p[va]; uu = p[ua] + (f + 1) * 0.37; } else { uu = p[ua]; vv = p[va] + 0.19; }
          const x = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12], y = e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13], z = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
          const n = [0, 0, 0]; n[na] = sg;
          let nx = e[0] * n[0] + e[4] * n[1] + e[8] * n[2], ny = e[1] * n[0] + e[5] * n[1] + e[9] * n[2], nz = e[2] * n[0] + e[6] * n[1] + e[10] * n[2];
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          const ty = (p[1] / (s[1] || 1)) * 0.5 + 0.5, shd = sh0 + (sh1 - sh0) * ty;
          k.pos.push(x, y, z); k.nor.push(nx, ny, nz);
          if (S > 0) k.uv.push(uu / S + u0, vv / S + v0); else k.uv.push(su * 0.5 + 0.5, sv * 0.5 + 0.5);
          k.col.push(col[0] * shd, col[1] * shd, col[2] * shd); k.wear.push(w0 + (w1 - w0) * ty);
          vid[f * 8 + c] = k.n++;
        }
        const a = vid[f * 8], b = vid[f * 8 + 1], c2 = vid[f * 8 + 2], d = vid[f * 8 + 3];
        // winding so the triangle normal matches the face normal
        const flip = (na === 0 ? sg : na === 1 ? sg : -sg) > 0;
        if (flip) k.idx.push(a, c2, b, a, d, c2); else k.idx.push(a, b, c2, a, c2, d);
      }
      if (bev > 0 && !skip) {
        // chamfers reuse the inset face vertices, so normals blend across the edge (reads as an eased edge)
        const P = k.pos, N = k.nor, V = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
        const tri = (a, b, c) => { // orient outward using the averaged vertex normals
          const pa = V(a), pb = V(b), pc = V(c), ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2], vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
          const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
          const sx2 = N[a * 3] + N[b * 3] + N[c * 3], sy2 = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], sz2 = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
          if (cx * sx2 + cy * sy2 + cz * sz2 >= 0) k.idx.push(a, b, c); else k.idx.push(a, c, b);
        };
        // corner id (bit per axis) -> vertex index on each of its three faces (indexed by the face's normal axis)
        const cv = []; for (let i = 0; i < 8; i++) cv.push([-1, -1, -1]);
        for (let f = 0; f < 6; f++) { const [na, sg, ua, va] = FACES[f]; for (let c = 0; c < 4; c++) { const su = (c === 0 || c === 3) ? -1 : 1, sv = c < 2 ? -1 : 1, sgn = [0, 0, 0]; sgn[na] = sg; sgn[ua] = su; sgn[va] = sv; cv[(sgn[0] > 0 ? 1 : 0) | (sgn[1] > 0 ? 2 : 0) | (sgn[2] > 0 ? 4 : 0)][na] = vid[f * 8 + c]; } }
        for (let i = 0; i < 8; i++) tri(cv[i][0], cv[i][1], cv[i][2]);
        for (let i = 0; i < 8; i++) for (let ax = 0; ax < 3; ax++) { if (i & (1 << ax)) continue; const j = i | (1 << ax), f1 = (ax + 1) % 3, f2 = (ax + 2) % 3; tri(cv[i][f1], cv[j][f1], cv[j][f2]); tri(cv[i][f1], cv[j][f2], cv[i][f2]); }
      }
      return this;
    }
    // Append any BufferGeometry. o: { color, wear, uvMul: [u,v], keepColor (use geometry's own color attribute) }
    geo(m, g, m4, o = {}) {
      const k = this.bucket(m), pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = o.keepColor ? g.attributes.color : null;
      const col = kit.rgb(o.color), base = k.n, e = m4 ? m4.elements : null, w = o.wear ?? 0.3, um = o.uvMul || [1, 1], uo = o.uvOff || [0, 0];
      const nm = m4 ? new THREE.Matrix3().getNormalMatrix(m4).elements : null;
      for (let i = 0; i < pa.count; i++) {
        let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), nx = na ? na.getX(i) : 0, ny = na ? na.getY(i) : 1, nz = na ? na.getZ(i) : 0;
        if (e) {
          const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; x = X; y = Y; z = Z;
          const NX = nm[0] * nx + nm[3] * ny + nm[6] * nz, NY = nm[1] * nx + nm[4] * ny + nm[7] * nz, NZ = nm[2] * nx + nm[5] * ny + nm[8] * nz, l = Math.hypot(NX, NY, NZ) || 1; nx = NX / l; ny = NY / l; nz = NZ / l;
        }
        k.pos.push(x, y, z); k.nor.push(nx, ny, nz);
        k.uv.push((ua ? ua.getX(i) : 0) * um[0] + uo[0], (ua ? ua.getY(i) : 0) * um[1] + uo[1]);
        if (ca) k.col.push(ca.getX(i) * col[0], ca.getY(i) * col[1], ca.getZ(i) * col[2]); else k.col.push(col[0], col[1], col[2]);
        k.wear.push(typeof w === 'function' ? w(x, y, z) : w);
      }
      if (g.index) { const ix = g.index; for (let i = 0; i < ix.count; i++) k.idx.push(base + ix.getX(i)); } else for (let i = 0; i < pa.count; i++) k.idx.push(base + i);
      k.n += pa.count;
      return this;
    }
    // Cylinder along local Y (centered). UVs in meters. o: { seg, caps, color, wear, open }
    cyl(m, rTop, rBot, h, m4, o = {}) {
      const seg = o.seg ?? 12, S = o.uvS ?? m.userData.uvScale ?? 1, g = new THREE.CylinderGeometry(rTop, rBot, h, seg, o.hseg ?? 1, o.caps === false);
      const circ = Math.PI * (rTop + rBot); return this.geo(m, g, m4, { ...o, uvMul: S > 0 ? [circ / S, h / S] : [1, 1], uvOff: [o.uv?.[0] ?? kit.hash(h, rTop, this.bucket(m).n) * 5, o.uv?.[1] ?? kit.hash(rBot, h, 2) * 5] });
    }
    // Strut (box) from a to b with cross-section w x t; grain along the strut.
    strut(m, a, b, w, t, o = {}) { const { m: mm, len } = kit.span(a, b, o.roll || 0); return this.box(m, w, len + (o.extra || 0), t, mm, { grain: 1, ...o }); }
    rod(m, a, b, r, o = {}) { const { m: mm, len } = kit.span(a, b); return this.cyl(m, r, r, len, mm, { seg: 8, ...o }); }
    // Tube along a list of points (ropes, hoses, conduit, cables). o: { seg, color, closed, tension }
    tube(m, pts, r, o = {}) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), !!o.closed, 'catmullrom', o.tension ?? 0.5), len = curve.getLength();
      const g = new THREE.TubeGeometry(curve, o.steps ?? Math.max(8, Math.round(len / (o.stepLen ?? 0.06))), r, o.seg ?? 6, !!o.closed), S = o.uvS ?? m.userData.uvScale ?? 1;
      return this.geo(m, g, o.m4 || null, { ...o, uvMul: S > 0 ? [len / S, (2 * Math.PI * r) / S] : [1, 1] });
    }
    count() { let v = 0, t = 0; for (const k of this.b.values()) { v += k.n; t += k.idx.length / 3; } return { verts: v, tris: t }; }
    // Merge into meshes. o: { cast, receive, parent, layer }
    build(parent, o = {}) {
      const out = [];
      for (const [m, k] of this.b) {
        if (!k.n) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(k.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(k.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(k.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(k.col, 3));
        g.setAttribute('aWear', new THREE.Float32BufferAttribute(k.wear, 1));
        g.setIndex(k.n > 65535 ? new THREE.Uint32BufferAttribute(k.idx, 1) : new THREE.Uint16BufferAttribute(k.idx, 1));
        g.computeBoundingSphere(); g.computeBoundingBox();
        const mesh = new THREE.Mesh(g, m); mesh.name = `${this.name}:${m.name || 'mat'}`;
        mesh.castShadow = o.cast ?? !m.transparent; mesh.receiveShadow = o.receive ?? true;
        if (m.transparent) mesh.renderOrder = 2;
        parent?.add(mesh); out.push(mesh);
      }
      this.b.clear(); return out;
    }
  }
  kit.Batch = Batch;
  kit.batch = (name) => new Batch(name);

  // Instanced helper: geometry + material + list of Matrix4 (and optional per-instance colors)
  kit.instances = (geo, m, mats, colors, o = {}) => {
    if (m.vertexColors && !geo.attributes.color) geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
    const im = new THREE.InstancedMesh(geo, m, mats.length);
    for (let i = 0; i < mats.length; i++) { im.setMatrixAt(i, mats[i]); if (colors) im.setColorAt(i, _c.setRGB(...kit.rgb(colors[i]))); }
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = o.cast ?? false; im.receiveShadow = o.receive ?? true; im.computeBoundingSphere(); return im;
  };

  // ---------- GLTF props (CC0 Poly Haven models) ----------
  const gltf = new GLTFLoader(), modelCache = new Map();
  // Resolves to a THREE.Group (cloned per call) or null if the model is missing. Models live in public/assets/setpieces/nicoHouse/models/<id>/<id>.gltf
  kit.model = (id, o = {}) => {
    if (!modelCache.has(id)) modelCache.set(id, gltf.loadAsync(`${base}models/${id}/${id}.gltf`).then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const t of [o.material.map, o.material.normalMap, o.material.roughnessMap]) if (t) t.anisotropy = Math.min(4, maxAniso); } });
      return g.scene;
    }).catch((e) => { console.warn('[nicoHouse] model missing', id, e?.message || e); return null; }));
    return modelCache.get(id).then((s) => { if (!s) return null; const c = s.clone(true); if (o.interior) c.traverse((n) => { if (n.isMesh) { n.material = (n.material.userData.nhInt ||= kit.setIndirect(Object.assign(n.material.clone(), { name: 'gltf:' + id + ':' + n.material.name }))); n.material.envMapIntensity = 0.6; } }); return c; });
  };

  // ---------- text / label drawing ----------
  kit.font = (px, weight = 700, family = 'Helvetica Neue, Arial, sans-serif') => `${weight} ${px}px ${family}`;

  return kit;
}

// Build context shared by every part: batches, colliders, interactions, lights, anchors, updaters.
export function createContext(THREE, kit, plan, opts = {}) {
  const group = new THREE.Group(); group.name = 'nicoHouse';
  const ctx = {
    THREE, kit, plan, opts, group, mat: kit.mat,
    // static merged geometry: exterior (always visible), interior (hidden at distance), detail (small clutter, hidden farther out)
    ext: kit.batch('ext'), int: kit.batch('int'), detail: kit.batch('detail'), site: kit.batch('site'), imat: kit.imat,
    groups: { ext: new THREE.Group(), int: new THREE.Group(), detail: new THREE.Group(), dyn: new THREE.Group(), site: new THREE.Group(), shell: new THREE.Group() },
    colliders: [], interact: [], lights: [], anchors: {}, updaters: [], async: [], stats: {},
    M: kit.M,
  };
  for (const [n, g] of Object.entries(ctx.groups)) { g.name = 'nh_' + n; group.add(g); }
  // collider descriptors: { shape:'box'|'cyl'|'ball', p:[x,y,z] center, h:[hx,hy,hz] | r/hh, q:[x,y,z,w], tag, id, enabled }
  const q4 = (rx, ry, rz) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')); return [q.x, q.y, q.z, q.w]; };
  ctx.col = {
    box: (x, y, z, sx, sy, sz, o = {}) => { const c = { shape: 'box', p: [x, y, z], h: [sx / 2, sy / 2, sz / 2], q: q4(o.rx || 0, o.ry || 0, o.rz || 0), tag: o.tag || 'solid', id: o.id, enabled: o.enabled !== false, surface: o.surface }; ctx.colliders.push(c); return c; },
    cyl: (x, y, z, r, h, o = {}) => { const c = { shape: 'cyl', p: [x, y, z], r, hh: h / 2, q: q4(o.rx || 0, o.ry || 0, o.rz || 0), tag: o.tag || 'solid', id: o.id, enabled: o.enabled !== false }; ctx.colliders.push(c); return c; },
  };
  // interaction descriptors: { id, kind, label | label(), pos: Vector3 (house-local), radius, use(env) }  env = { game, emit(name, data), notify(text) }
  ctx.addInteract = (it) => { it.pos = it.pos.isVector3 ? it.pos : new THREE.Vector3(...it.pos); it.radius ??= 1.3; ctx.interact.push(it); return it; };
  ctx.addLight = (l) => { ctx.lights.push(l); return l; };
  return ctx;
}

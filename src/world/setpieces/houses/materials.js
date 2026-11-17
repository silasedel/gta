// House generator: shared materials on top of the Nico house kit (track: houses).
// One kit (and one texture cache) for every generated house, so all lots share materials and textures.
// Every house material carries the lot-hide hook: geometry merged across lots (mid / far LOD) has a per-vertex lot id
// (aLot); a lot whose full-detail build is showing is hidden in the merged mesh by one texel in a shared 64 x 64 mask.
import { createKit } from '../nicoHouse/kit.js';

export function createHouseKit(THREE, opts = {}) {
  const kit = createKit(THREE, { anisotropy: 4, seaY: -50, ...opts });
  if (opts.shareTex) kit.tex = opts.shareTex;     // reuse the Nico house's texture cache (same files): no duplicate GPU textures
  const mat = kit.mat;

  // ---------- lot-hide mask ----------
  const N = 128, maskData = new Uint8Array(N * N);
  const mask = new THREE.DataTexture(maskData, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  mask.minFilter = mask.magFilter = THREE.NearestFilter; mask.needsUpdate = true;
  const uMask = { value: mask };
  kit.lotMask = {
    size: N * N,
    hidden(id) { return id > 0 && id < N * N && maskData[id] > 0; },
    set(id, hidden) { if (id > 0 && id < N * N && maskData[id] !== (hidden ? 255 : 0)) { maskData[id] = hidden ? 255 : 0; mask.needsUpdate = true; } },
  };
  const HIDE_PARS = 'attribute float aLot;\nuniform sampler2D uLotMask;\n';
  const HIDE_MAIN = '{ int hl = int( aLot + 0.5 ); if ( hl > 0 && texelFetch( uLotMask, ivec2( hl % 128, hl / 128 ), 0 ).r > 0.5 ) transformed = vec3( 0.0 ); }\n';
  const wrapped = new WeakSet();
  kit.hideHook = (m) => {
    if (wrapped.has(m)) return m; wrapped.add(m);
    const prev = m.onBeforeCompile, pk = m.customProgramCacheKey;
    m.onBeforeCompile = function (sh, r) {
      prev.call(this, sh, r);
      sh.uniforms.uLotMask = uMask;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + HIDE_PARS).replace('#include <project_vertex>', HIDE_MAIN + '#include <project_vertex>');
    };
    m.customProgramCacheKey = function () { return (pk ? pk.call(this) : '') + '|lotHide'; };
    m.needsUpdate = true;
    return m;
  };
  // depth material for merged meshes (shadows follow the mask)
  kit.hideDepth = kit.hideHook(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));

  // ---------- night windows ----------
  // Opaque glass: dark, glossy (sky reflections by day), tinted by the curtain / blind behind it (vertex color).
  // aWear = how lit the room behind is (0 dark .. 1 bright); uNight fades the light in at dusk.
  kit.uNight = { value: 0 };
  const win = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.07, metalness: 0.0, envMapIntensity: 1.25, color: 0xffffff });
  win.name = 'house:window'; win.userData.uvScale = 0;
  win.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = kit.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWear;\nvarying float vLit;\n').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aWear;\n');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLit;\nuniform float uNight;\n')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  vec3 hwTint = diffuseColor.rgb;\n  diffuseColor.rgb = hwTint * 0.09 + vec3( 0.012, 0.016, 0.02 );\n')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += mix( vec3( 1.0, 0.62, 0.3 ), hwTint * vec3( 1.25, 1.0, 0.75 ), 0.45 ) * vLit * uNight * 2.2 + hwTint * vLit * ( 1.0 - uNight ) * 0.05;   // by day a lit room reads through the glass\n');
  };
  win.customProgramCacheKey = () => 'house:window';
  mat.houseWindow = () => win;

  // porch / wall lamp glass: warm emissive when the night uniform is up
  const bulb = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, color: 0xffffff });
  bulb.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = kit.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWear;\nvarying float vLit;\n').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aWear;\n');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLit;\nuniform float uNight;\n')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3( 1.0, 0.72, 0.42 ) * vLit * uNight * 9.0;\n');
  };
  bulb.customProgramCacheKey = () => 'house:bulb'; bulb.name = 'house:bulb'; bulb.userData.uvScale = 0;
  mat.houseBulb = () => bulb;

  // ---------- canvas textures ----------
  const shingleTex = kit.canvasTex(512, 512, (g, w, h) => {      // 3-tab asphalt shingles: tabs, slots, granule speckle, streaks
    const r = kit.rng(77); g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
    const rows = 8, rh = h / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * (w / 6);
      for (let x = -1; x < 4; x++) {
        const v = 120 + r() * 50 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x * w / 3 + off + 2, y * rh, w / 3 - 4, rh);
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x * w / 3 + off - 2, y * rh + rh * 0.35, 4, rh * 0.65);
      }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y * rh + rh - 3, w, 3);
    }
    for (let i = 0; i < 9000; i++) { const v = r() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.3})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    for (let i = 0; i < 40; i++) { const x = r() * w; const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, 'rgba(30,30,25,0)'); lg.addColorStop(1, 'rgba(30,30,25,0.18)'); g.fillStyle = lg; g.fillRect(x, 0, 4 + r() * 18, h); }
  });
  mat.shingle = () => kit.materials.get('house:shingle') || (() => { const m = new THREE.MeshStandardMaterial({ map: shingleTex, vertexColors: true, roughness: 0.92, bumpMap: shingleTex, bumpScale: 1.4 }); m.name = 'house:shingle'; m.userData.uvScale = 1.8; kit.materials.set(m.name, m); return m; })();

  // chain-link mesh (alpha-tested diamonds)
  const chainTex = kit.canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(200,205,205,1)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke(); });
  mat.chainlink = () => kit.materials.get('house:chain') || (() => { const m = new THREE.MeshStandardMaterial({ map: chainTex, alphaTest: 0.4, transparent: false, metalness: 1, roughness: 0.5, side: THREE.DoubleSide, vertexColors: true }); m.name = 'house:chain'; m.userData.uvScale = 0.06; kit.materials.set(m.name, m); return m; })();

  // insect screen (pool cages, porches)
  const screenTex = kit.canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(30,34,36,0.9)'; g.lineWidth = 1.2; for (let i = 0; i <= w; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } });
  mat.screen = () => kit.materials.get('house:screen') || (() => { const m = new THREE.MeshStandardMaterial({ map: screenTex, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.8, side: THREE.DoubleSide }); m.name = 'house:screen'; m.userData.uvScale = 0.03; kit.materials.set(m.name, m); return m; })();

  // breeze block (mid-century screen walls): four-petal openings
  const breezeTex = kit.canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-out';
    for (const [cx, cy] of [[32, 32], [96, 32], [32, 96], [96, 96]]) { g.beginPath(); g.ellipse(cx, cy, 22, 22, 0, 0, 6.3); g.fill(); }
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff'; g.fillRect(62, 0, 4, h); g.fillRect(0, 62, w, 4);
    for (const [cx, cy] of [[32, 32], [96, 32], [32, 96], [96, 96]]) { g.beginPath(); g.arc(cx, cy, 6, 0, 6.3); g.fill(); }
  });
  // soft oil / tire stains on driveways (lead review): a noise-edged, low-opacity blotch texture, no hard rectangles
  mat.oilStain = () => kit.materials.get('house:oil') || (() => { const t = kit.canvasTex(128, 128, (g, w, h) => { const q = kit.rng(41); g.clearRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const a = q() * 6.28, d = Math.sqrt(q()) * 0.36 * w, x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d * 0.8, r2 = 6 + q() * 18, gr = g.createRadialGradient(x, y, 0, x, y, r2);
        gr.addColorStop(0, `rgba(38,34,30,${0.10 + q() * 0.12})`); gr.addColorStop(1, 'rgba(38,34,30,0)'); g.fillStyle = gr; g.fillRect(x - r2, y - r2, r2 * 2, r2 * 2); } }, { srgb: true });
    const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    m.name = 'house:oil'; m.userData.uvScale = 1; kit.materials.set(m.name, m); return m; })();
  mat.breeze = () => kit.materials.get('house:breeze') || (() => { const m = new THREE.MeshStandardMaterial({ map: breezeTex, alphaTest: 0.5, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, bumpMap: kit.microTex(), bumpScale: 1 }); m.name = 'house:breeze'; m.userData.uvScale = 0.4; kit.materials.set(m.name, m); return m; })();

  // house-number digits (atlas 0-9, uv x = digit / 10)
  const digitTex = kit.canvasTex(640, 96, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = kit.font(84, 700, 'Georgia, serif'); for (let i = 0; i < 10; i++) g.fillText(String(i), i * 64 + 32, 50); }, { repeat: false });
  mat.digits = () => kit.materials.get('house:digits') || (() => { const m = new THREE.MeshStandardMaterial({ map: digitTex, alphaTest: 0.5, vertexColors: true, roughness: 0.45, metalness: 0 }); m.name = 'house:digits'; m.userData.uvScale = 0; kit.materials.set(m.name, m); return m; })();

  // pool water: bright, glossy, tile line under the surface by vertex shading
  const wn = new THREE.TextureLoader().load((import.meta.env?.BASE_URL ?? '/') + 'assets/env/waternormals.jpg'); wn.wrapS = wn.wrapT = THREE.RepeatWrapping;
  mat.poolWater = () => kit.materials.get('house:pool') || (() => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.0, normalMap: wn, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.4 }); m.name = 'house:pool'; m.userData.uvScale = 3; kit.materials.set(m.name, m); return m; })();

  // stucco: concrete scan with grunge, tinted by vertex color (painted CBS block)
  // r2-art (ART_STYLE.md): stucco / stone are matte (effective roughness ~0.85 over the scan's 0.74 mean) with a calmer normal
  mat.stucco = () => mat.pbr('concrete_wall_008', { rep: 1.4, grunge: true, gain: 2.25, rough: 1.15, nscale: 0.7 });
  mat.stoneVeneer = () => mat.pbr('coral_stone_wall', { rep: 1.2, grunge: true, gain: 1.6, rough: 1.15, nscale: 0.85 });
  mat.pavers = () => mat.pbr('scuffed_cement', { rep: 1.6, grunge: true, tint: '#bcd2ff', gain: 3.4 }); // r2-art: brown scan tinted to neutral concrete (same material as the towns' walks)
  // ---------- shop glass with an interior (cheap interior mapping) ----------
  // Each glass quad (uv 0..1 across the pane) opens onto a box room behind it: ray from the eye through the pane, hit the
  // back wall, side walls, floor or ceiling, shade each procedurally. aWear = kind + lit (integer part = room kind,
  // fraction = how lit). Kinds: 0 plain room, 1 shelves with goods, 2 cafe (counter, tables, pendant lamps), 3 boutique
  // racks, 4 office / bank (desks, wood panelling), 5 diner (counter and red stools). Vertex color = the room's wall tint.
  // Day: the room reads at a soft level through glossy glass (sky reflections from the environment); night: warm light.
  const white1 = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white1.needsUpdate = true;
  const shopGlass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.0, envMapIntensity: 0.32, map: white1, color: 0xffffff });   // soft sky sheen: the room must read through it by day
  shopGlass.name = 'house:shopGlass'; shopGlass.userData.uvScale = 0;
  shopGlass.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = kit.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWear;\nvarying float vRoom;\nvarying vec3 vRoomW;\n')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoom = aWear;\nvRoomW = ( modelMatrix * vec4( position, 1.0 ) ).xyz;\n');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vRoom; varying vec3 vRoomW; uniform float uNight;
float rh( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
vec3 roomColor( vec2 uv, vec3 V, vec3 N, vec3 dpx, vec3 dpy, vec2 dux, vec2 duy, vec3 tint, float kind, float seed ) {
  vec3 p1 = cross( N, dpx ), p2 = cross( dpy, N );
  vec3 T = p2 * dux.x + p1 * duy.x, B = p2 * dux.y + p1 * duy.y;
  float im = inversesqrt( max( dot( T, T ), dot( B, B ) ) + 1e-12 ); T *= im; B *= im;
  vec3 d = vec3( dot( V, T ), dot( V, B ), -dot( V, N ) ); d.z = max( d.z, 0.05 );
  float depth = 0.9; vec3 o = vec3( uv, 0.0 );
  float tx = d.x > 0.0 ? ( 1.0 - o.x ) / d.x : -o.x / min( d.x, -1e-4 );
  float ty = d.y > 0.0 ? ( 1.0 - o.y ) / d.y : -o.y / min( d.y, -1e-4 );
  float tz = depth / d.z; float t = min( tz, min( tx, ty ) ); vec3 h = o + d * t;
  vec3 wall = tint, floorC = vec3( 0.32, 0.25, 0.18 ), ceilC = vec3( 0.92, 0.9, 0.86 ), c;
  if ( t == tz ) { // back wall with the room's furniture
    c = wall;
    if ( kind < 0.5 ) { c *= 0.9 + 0.1 * step( 0.5, fract( h.x * 3.0 ) ); }
    else if ( kind < 1.5 ) { float row = floor( h.y * 4.0 ), f = fract( h.y * 4.0 ); vec2 cell = vec2( floor( h.x * 9.0 ), row ); vec3 g = vec3( rh( cell + seed ), rh( cell + seed + 7.0 ), rh( cell + seed + 13.0 ) ); c = f < 0.08 ? vec3( 0.25, 0.2, 0.16 ) : ( f < 0.7 && h.y < 0.92 && h.y > 0.1 ? mix( g * 0.9 + 0.1, wall, step( 0.75, rh( cell + 3.0 + seed ) ) ) : wall * 0.75 ); }
    else if ( kind < 2.5 ) { c = h.y < 0.38 ? vec3( 0.36, 0.24, 0.15 ) * ( 0.9 + 0.1 * step( 0.5, fract( h.x * 12.0 ) ) ) : ( h.y < 0.42 ? vec3( 0.75, 0.72, 0.66 ) : wall ); if ( h.y > 0.55 && h.y < 0.8 ) { vec2 cell = vec2( floor( h.x * 6.0 ), 0.0 ); c = mix( c, vec3( rh( cell + seed ), 0.4, 0.3 ), 0.5 * step( 0.3, fract( h.x * 6.0 ) ) * step( fract( h.x * 6.0 ), 0.8 ) ); } }
    else if ( kind < 3.5 ) { float col = fract( h.x * 7.0 ); vec2 cell = vec2( floor( h.x * 7.0 ), floor( h.y * 2.0 ) ); vec3 g = vec3( rh( cell + seed ), rh( cell + seed + 5.0 ), rh( cell + seed + 9.0 ) ); c = ( h.y > 0.3 && h.y < 0.85 && col > 0.15 && col < 0.85 ) ? g * 0.75 + 0.15 : wall; if ( abs( h.y - 0.86 ) < 0.012 ) c = vec3( 0.6 ); }
    else if ( kind < 4.5 ) { c = h.y < 0.45 ? vec3( 0.38, 0.26, 0.17 ) * ( 0.85 + 0.15 * step( 0.5, fract( h.x * 5.0 ) ) ) : wall; if ( h.y > 0.55 && h.y < 0.8 && fract( h.x * 2.0 ) > 0.2 && fract( h.x * 2.0 ) < 0.8 ) c = vec3( 0.55, 0.6, 0.62 ); }
    else { c = h.y < 0.4 ? vec3( 0.75, 0.12, 0.12 ) : ( h.y < 0.44 ? vec3( 0.85 ) : wall ); if ( h.y > 0.6 && h.y < 0.75 ) c = vec3( 0.85, 0.85, 0.8 ); }
  } else if ( t == ty ) {
    if ( d.y < 0.0 ) { c = floorC * ( 0.85 + 0.15 * step( 0.5, fract( h.x * 4.0 + floor( h.z * 4.0 ) * 0.5 ) ) ); if ( kind > 1.5 && kind < 2.5 ) { vec2 q = fract( vec2( h.x * 2.0, h.z * 2.5 ) ) - 0.5; c = mix( c, vec3( 0.2, 0.14, 0.1 ), step( length( q ), 0.22 ) ); } }
    else { c = ceilC; float lp = step( 0.85, fract( h.x * 2.0 + 0.4 ) ) * step( 0.3, fract( h.z * 1.5 ) ); c = mix( c, vec3( 1.6, 1.5, 1.3 ), lp ); }
  } else { c = wall * 0.82; if ( kind > 0.5 && kind < 1.5 ) { float f = fract( h.y * 4.0 ); vec2 cell = vec2( floor( h.z * 6.0 ), floor( h.y * 4.0 ) ); c = f < 0.08 ? vec3( 0.25, 0.2, 0.16 ) : mix( vec3( rh( cell + seed + 2.0 ), rh( cell + seed + 4.0 ), rh( cell + seed + 6.0 ) ) * 0.8 + 0.1, c, 0.35 ); } }
  return c * mix( 1.0, 0.55, h.z / depth );
}
`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float kind = floor( vRoom ), lit = fract( vRoom ); vec3 V = normalize( -vViewPosition );   // eye -> fragment
    vec3 dpx = dFdx( -vViewPosition ), dpy = dFdy( -vViewPosition ); vec3 Ng = normalize( cross( dpx, dpy ) ); if ( dot( Ng, vViewPosition ) < 0.0 ) Ng = -Ng;
    vec3 room = roomColor( vMapUv, V, Ng, dpx, dpy, dFdx( vMapUv ), dFdy( vMapUv ), vColor.rgb, kind, floor( vRoomW.x * 0.3 ) + floor( vRoomW.z * 0.3 ) * 7.0 );
    float day = 1.0 - uNight;
    totalEmissiveRadiance += room * ( day * ( 0.42 + 0.3 * lit ) + uNight * ( 0.3 + 1.0 * lit ) * vec3( 1.0, 0.84, 0.62 ) ); }
`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = vec3( 0.02, 0.025, 0.03 );\n');
  };
  shopGlass.customProgramCacheKey = () => 'house:shopGlass';
  mat.shopGlass = () => shopGlass;

  // ---------- brick (canvas): running bond, color variation per brick, mortar recess as bump ----------
  const brickTex = kit.canvasTex(512, 512, (g, w, h) => {
    const r = kit.rng(41); g.fillStyle = '#b8b0a2'; g.fillRect(0, 0, w, h); const bh = 32, bw = 96;
    for (let y = 0; y < h; y += bh) for (let x = -bw; x < w; x += bw) { const o = (y / bh) % 2 ? bw / 2 : 0, v = 0.78 + r() * 0.3, t = r(); g.fillStyle = `rgb(${(214 * v) | 0},${(196 * v * (0.95 + t * 0.08)) | 0},${(182 * v * (0.9 + t * 0.1)) | 0})`; g.fillRect(x + o + 3, y + 3, bw - 6, bh - 6);
      for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.fillRect(x + o + 3 + r() * (bw - 8), y + 3 + r() * (bh - 8), 2 + r() * 4, 1 + r() * 2); } }
  });
  const brickBump = kit.canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#202020'; g.fillRect(0, 0, w, h); g.fillStyle = '#e0e0e0'; const bh = 32, bw = 96; for (let y = 0; y < h; y += bh) for (let x = -bw; x < w; x += bw) { const o = (y / bh) % 2 ? bw / 2 : 0; g.fillRect(x + o + 4, y + 4, bw - 8, bh - 8); } }, { srgb: false });
  mat.brick = () => kit.materials.get('house:brick') || (() => { const m = new THREE.MeshStandardMaterial({ map: brickTex, bumpMap: brickBump, bumpScale: 2.2, roughness: 0.88, vertexColors: true }); m.name = 'house:brick'; m.userData.uvScale = 1.6; kit.materials.set(m.name, m); return m; })();
  return kit;
}

import * as THREE from 'three';
import { LOOK_OFF } from './fogChunks.js';
import { ladder } from '../ground/depthLadder.js';

// Clustered street-lamp lighting for every lit built-in material (Standard / Physical / Lambert / Phong / Toon).
//  - Lamps are registered in world space (env.lamps.add / addMany, or Object3D.userData.psLamps).
//  - Each frame (when the camera moves) the nearest MAX_LIGHTS lamps within CLUSTER_R are packed into a
//    float DataTexture and binned into a GRID x GRID world-space tile grid around the camera (K per tile).
//  - A patched lights_fragment_begin loops over the fragment's tile and calls RE_Direct, so characters,
//    cars and buildings all receive proper PBR lamp light (inverse-square + range, downward cone).
//  - Beyond CLUSTER_R, lamps are represented by cheap additive ground pools (one InstancedMesh).

const MAX_LIGHTS = 256;
const GRID = 16;           // tiles per side
const TILE = 22;           // metres per tile  -> 352 m grid around the camera
// lights per tile (4 RGBA texels). Was 8: where more lamps reached a tile (the Keys lots: street lamps + porch and yard
// lights), the extra ones were cut off at the 22 m tile edge, which drew hard straight light lines and bright rectangles
// on the ground and made light pop on and off as the camera-snapped grid moved. Each tile now keeps the K lamps that
// light its center most (intensity / distance^2), so a lamp that does not make the cut is too weak to leave an edge.
const K = 16;
const LAMP_SOFT = !(typeof location !== 'undefined' && /[?&]lampsoft=0\b/.test(location.search)); // sphere-light highlight (A/B)
const KT = K / 4;          // texels per tile
export const CLUSTER_R = 165;
const POOL_FAR = 1100;

let chunksPatched = false;
const lampInfo = { x: 0, y: 0, z: TILE, w: 0 }; // plain object => shared by reference across cloned uniforms
let dataTex = null, gridTex = null;

function makeTextures() {
  const d = new Float32Array(MAX_LIGHTS * 2 * 4);
  dataTex = new THREE.DataTexture(d, MAX_LIGHTS, 2, THREE.RGBAFormat, THREE.FloatType);
  const g = new Float32Array(GRID * KT * GRID * 4).fill(-1);
  gridTex = new THREE.DataTexture(g, GRID * KT, GRID, THREE.RGBAFormat, THREE.FloatType);
  for (const t of [dataTex, gridTex]) {
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    // keep a single shared instance across UniformsUtils.clone() (it clones anything with isTexture)
    t.isTexture = false;
  }
}

export function patchLampChunks() {
  if (chunksPatched) return; chunksPatched = true;
  makeTextures();
  const C = THREE.ShaderChunk;
  C.lights_pars_begin = C.lights_pars_begin + /* glsl */`
#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )
	#define PS_LAMPS
	uniform highp sampler2D uLampData;
	uniform highp sampler2D uLampGrid;
	uniform vec4 uLampInfo;
#endif
`;
  const marker = 'IncidentLight directLight;';
  if (!C.lights_fragment_begin.includes(marker)) { console.warn('[lamps] chunk marker missing'); return; }
  C.lights_fragment_begin = C.lights_fragment_begin.replace(marker, marker + /* glsl */`
#if defined( PS_LAMPS ) && defined( RE_Direct )
	if ( uLampInfo.w > 0.5 ) {
		vec3 psWP = cameraPosition + ( vec4( geometryPosition, 0.0 ) * viewMatrix ).xyz;
		ivec2 psT = ivec2( floor( ( psWP.xz - uLampInfo.xy ) / uLampInfo.z ) );
		if ( psT.x >= 0 && psT.y >= 0 && psT.x < ${GRID} && psT.y < ${GRID} ) {
			for ( int psk = 0; psk < ${KT}; psk ++ ) {
				vec4 psIds = texelFetch( uLampGrid, ivec2( psT.x * ${KT} + psk, psT.y ), 0 );
				for ( int psc = 0; psc < 4; psc ++ ) {
					float psF = psIds[ psc ];
					if ( psF < 0.0 ) break;
					int psI = int( psF + 0.5 );
					vec4 psP = texelFetch( uLampData, ivec2( psI, 0 ), 0 );
					vec4 psC = texelFetch( uLampData, ivec2( psI, 1 ), 0 );
					vec3 psL = psP.xyz - psWP;
					float psD = length( psL );
					if ( psD >= psP.w ) continue;
					vec3 psLd = psL / max( psD, 1e-4 );
					// mostly-downward luminaire: full strength below, dim spill sideways/up
					// look track: a tighter downward cone and less side spill, so lamps make warm pools on a dark street
					// instead of washing the whole block (?lookoff restores the old cone)
					float psSpot = ${LOOK_OFF ? 'mix( 0.1, 1.0, smoothstep( 0.15, 0.8, psLd.y ) )' : 'mix( 0.025, 1.0, smoothstep( 0.55, 0.93, psLd.y ) )'};
					directLight.direction = normalize( ( viewMatrix * vec4( psLd, 0.0 ) ).xyz );
					// inverse-square with a soft near field (luminaire ~4 m 'size') so nearby walls/people don't blow out
					float psWin = 1.0 - pow( psD / psP.w, 4.0 ); psWin *= psWin;
					directLight.color = psC.rgb * ( psC.w * psWin * psSpot / ( psD * psD + ${LOOK_OFF ? '16.0' : '9.0'} ) );
					directLight.visible = true;
					#if defined( STANDARD ) && ${LAMP_SOFT ? 1 : 0}
					// render track (Nov 18, user: "unrealistic bright edge on the light post"): a lamp is a ~0.35 m luminaire, not a
					// point. Its highlight is widened like a sphere light (roughness + radius / distance, Karis), so metal poles, car
					// paint and glass right under a lamp show a soft sheen instead of a razor-thin bright line along the edge.
					float psR0 = material.roughness;
					material.roughness = min( 1.0, psR0 + 0.35 / ( 2.0 * psD + 0.35 ) );
					RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
					material.roughness = psR0;
					#else
					RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
					#endif
				}
			}
		}
	}
#endif
`);
  for (const k of ['standard', 'physical', 'lambert', 'phong', 'toon']) {
    const sh = THREE.ShaderLib[k];
    if (!sh) continue;
    sh.uniforms.uLampData = { value: dataTex };
    sh.uniforms.uLampGrid = { value: gridTex };
    sh.uniforms.uLampInfo = { value: lampInfo };
  }
}

// colour palette: modern warm LED, old sodium, a few cool LEDs (linear RGB)
const PALETTE = [
  [1.0, 0.80, 0.58], [1.0, 0.80, 0.58], [1.0, 0.84, 0.66], [1.0, 0.76, 0.52],
  [1.0, 0.56, 0.22], [1.0, 0.60, 0.26],
  [0.86, 0.92, 1.0],
];
function hash2(x, z) { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); }

export function createLampSystem(game) {
  patchLampChunks();
  const { scene } = game;
  // registry (struct of arrays, grows)
  let cap = 1024, n = 0;
  let X = new Float32Array(cap), Y = new Float32Array(cap), Z = new Float32Array(cap), GY = new Float32Array(cap);
  let R = new Float32Array(cap), G = new Float32Array(cap), B = new Float32Array(cap), I = new Float32Array(cap), RG = new Float32Array(cap);
  let GRP = new Int32Array(cap);
  const CELL = 50;
  const cells = new Map();
  let groupSeq = 1, dirty = true, cellsDirty = true;
  const objGroups = new Map(); // Object3D -> group id

  function grow() {
    cap *= 2;
    const g = (a, T = Float32Array) => { const b = new T(cap); b.set(a); return b; };
    X = g(X); Y = g(Y); Z = g(Z); GY = g(GY); R = g(R); G = g(G); B = g(B); I = g(I); RG = g(RG); GRP = g(GRP, Int32Array);
  }
  const ck = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  function rebuildCells() {
    cells.clear();
    for (let i = 0; i < n; i++) {
      const k = ck(Math.floor(X[i] / CELL), Math.floor(Z[i] / CELL));
      let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i);
    }
  }
  function push(l, grp) {
    if (n >= cap) grow();
    const x = +l.x || 0, z = +l.z || 0, y = l.y ?? 7;
    X[n] = x; Y[n] = y; Z[n] = z; GY[n] = l.gy ?? (y - 7);
    let c = l.color;
    if (c && c.isColor) c = [c.r, c.g, c.b];
    else if (typeof c === 'number') { const t = new THREE.Color(c); c = [t.r, t.g, t.b]; }
    if (!c) c = PALETTE[Math.floor(hash2(x, z) * PALETTE.length) % PALETTE.length];
    R[n] = c[0]; G[n] = c[1]; B[n] = c[2];
    I[n] = l.intensity ?? 260; RG[n] = l.range ?? 28; GRP[n] = grp;
    n++;
  }
  const api = {
    get count() { return n; },
    /** add one lamp: world x,y (light height),z; opts {color, intensity, range, gy (ground y)} -> group id */
    add(x, y, z, opts = {}) { const g = groupSeq++; push({ x, y, z, ...opts }, g); dirty = cellsDirty = true; return g; },
    /** add many lamps [{x,y,z,gy?,color?,intensity?,range?}] -> group id (remove with removeGroup) */
    addMany(list, opts = {}) { const g = groupSeq++; for (const l of list) push({ ...opts, ...l }, g); dirty = cellsDirty = true; return g; },
    removeGroup(g) {
      let w = 0;
      for (let i = 0; i < n; i++) {
        if (GRP[i] === g) continue;
        if (w !== i) { X[w] = X[i]; Y[w] = Y[i]; Z[w] = Z[i]; GY[w] = GY[i]; R[w] = R[i]; G[w] = G[i]; B[w] = B[i]; I[w] = I[i]; RG[w] = RG[i]; GRP[w] = GRP[i]; }
        w++;
      }
      if (w !== n) { n = w; dirty = cellsDirty = true; }
    },
    clear() { n = 0; dirty = cellsDirty = true; },
  };

  // ---------- far ground pools ----------
  const poolMax = 20000;
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  const poolCol = new THREE.InstancedBufferAttribute(new Float32Array(poolMax * 4), 4);
  poolGeo.setAttribute('pcol', poolCol);
  const poolMat = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 0 }, uNear: { value: CLUSTER_R - 45 }, uFar: { value: POOL_FAR } },
    vertexShader: /* glsl */`
      attribute vec4 pcol;
      uniform float uNear, uFar;
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main() {
        vUv = position.xz * 2.0;
        vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
        vec3 c = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
        float d = distance( c.xz, cameraPosition.xz );
        vA = smoothstep( uNear, uNear + 45.0, d ) * ( 1.0 - smoothstep( uFar * 0.75, uFar, d ) );
        vCol = pcol.rgb * pcol.a;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOn;
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main() {
        float r = length( vUv );
        float a = exp( -r * r * 4.0 ) * ( 1.0 - smoothstep( 0.8, 1.0, r ) );
        a *= vA * uOn;
        if ( a < 0.002 ) discard;
        gl_FragColor = vec4( vCol * a, 1.0 );
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  ladder(poolMat, 'markings'); // W4 ground ladder: light pools sit over every road / sidewalk layer (was -2: tied with the paving)
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, poolMax);
  pools.count = 0; pools.frustumCulled = false; pools.renderOrder = 3; pools.name = 'lamp-pools';
  scene.add(pools);
  const _m = new THREE.Matrix4();
  // pools are rebuilt in chunks (a few thousand instances per frame) after the registry changes
  let poolCursor = -1;
  function rebuildPoolsStep(maxItems) {
    if (poolCursor < 0) return;
    const cnt = Math.min(n, poolMax);
    const end = Math.min(cnt, poolCursor + maxItems);
    for (let i = poolCursor; i < end; i++) {
      const s = Math.max(6, (Y[i] - GY[i]) * 1.6);
      _m.makeScale(s, 1, s).setPosition(X[i], GY[i] + 0.06, Z[i]);
      pools.setMatrixAt(i, _m);
      poolCol.array[i * 4] = R[i]; poolCol.array[i * 4 + 1] = G[i]; poolCol.array[i * 4 + 2] = B[i];
      poolCol.array[i * 4 + 3] = 0.12 * I[i] / 260;
    }
    pools.count = end;
    pools.instanceMatrix.needsUpdate = true; poolCol.needsUpdate = true;
    poolCursor = end >= cnt ? -1 : end;
  }

  // ---------- auto discovery (incremental: containers are discovered once a second and scanned
  // from a queue under a time budget; detached lamp meshes are dropped) ----------
  let scanT = 0, checkT = 0;
  const queue = [], queued = new WeakSet();
  const headGroups = new Map();   // lamp-head InstancedMesh -> { g, container }
  const listGroups = new Map();   // Object3D with userData.psLamps -> group
  function discover() {
    const roots = [scene];
    if (game.city?.root) roots.push(game.city.root);
    for (const r of roots) for (const c of r.children) if (!queued.has(c)) { queued.add(c); queue.push(c); }
  }
  function isAttached(o) { for (let p = o; p; p = p.parent) if (p === scene) return true; return false; }
  function scanContainer(c) {
    c.traverse((o) => {
      if (o.userData && Array.isArray(o.userData.psLamps) && !listGroups.has(o)) listGroups.set(o, { g: api.addMany(o.userData.psLamps), container: c });
      if (!o.isInstancedMesh || !o.material || Array.isArray(o.material)) return;
      const m = o.material;
      if (m.emissive && m.emissive.getHex?.() === 0xffd7a0 && m.color?.getHex?.() === 0x222222 && !headGroups.has(o)) {
        o.updateWorldMatrix(true, false);
        const list = [], mi = new THREE.Matrix4(), p = new THREE.Vector3(), b = new THREE.Vector3();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, mi); mi.premultiply(o.matrixWorld);
          p.set(0, 7.0, 2.25).applyMatrix4(mi); b.set(0, 0, 0).applyMatrix4(mi);
          list.push({ x: p.x, y: p.y, z: p.z, gy: b.y });
        }
        headGroups.set(o, { g: api.addMany(list), container: c });
      }
      // retire the flat additive "pool" decals (replaced by real lamp light + our far pools)
      if (m.isMeshBasicMaterial && m.blending === THREE.AdditiveBlending && m.color?.getHex?.() === 0xffc890 && o.layers.mask !== 0) o.layers.disableAll();
    });
  }
  function scanStep(dt) {
    scanT -= dt; checkT -= dt;
    if (scanT <= 0) { scanT = 1; discover(); }
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 0.8) {
      const c = queue.shift();
      if (c === game.city?.root) continue; // its children are queued individually
      scanContainer(c);
    }
    if (checkT <= 0) {
      checkT = 2;
      for (const map of [headGroups, listGroups]) for (const [o, rec] of map) {
        if (!isAttached(o)) { api.removeGroup(rec.g); map.delete(o); queued.delete(rec.container); }
      }
    }
  }

  // ---------- per frame clustering ----------
  const lastCam = new THREE.Vector3(1e9, 0, 0);
  const sel = new Int32Array(MAX_LIGHTS), selW = new Float32Array(MAX_LIGHTS);
  let candCap = 1024, candI = new Int32Array(candCap), candD = new Float32Array(candCap), order = new Int32Array(candCap);
  function growCand() { candCap *= 2; const a = new Int32Array(candCap); a.set(candI); candI = a; const b = new Float32Array(candCap); b.set(candD); candD = b; order = new Int32Array(candCap); }
  const fill = new Uint8Array(GRID * GRID), tileK = new Int16Array(GRID * GRID * K), tileS = new Float32Array(GRID * GRID * K);
  let lastOn = -1;
  /** nearest registered lamp to x, z (tools: rshots --pole): { x, y, z, gy } or null */
  api.nearest = (x, z) => { let b = -1, bd = 1e18; for (let i = 0; i < n; i++) { const d = (X[i] - x) ** 2 + (Z[i] - z) ** 2; if (d < bd) { bd = d; b = i; } } return b < 0 ? null : { x: X[b], y: Y[b], z: Z[b], gy: GY[b] }; };
  api.update = (dt, camera, on) => {
    try { scanStep(dt); } catch (e) { console.warn('[lamps] scan', e); }
    if (cellsDirty) { rebuildCells(); cellsDirty = false; poolCursor = 0; }
    rebuildPoolsStep(3000);
    poolMat.uniforms.uOn.value = on;
    const active = on > 0.01 && n > 0;
    lampInfo.w = active ? 1 : 0;
    if (!active) { lastOn = on; dirty = false; return; }
    const cam = camera.position;
    const moved = lastCam.distanceToSquared(cam) > 4;
    if (!moved && !dirty && Math.abs(on - lastOn) < 0.02) return;
    dirty = false; lastOn = on; lastCam.copy(cam);
    // gather candidates (preallocated: this ran every 2 m of camera travel and made arrays each time)
    let m = 0;
    const c0x = Math.floor((cam.x - CLUSTER_R) / CELL), c1x = Math.floor((cam.x + CLUSTER_R) / CELL);
    const c0z = Math.floor((cam.z - CLUSTER_R) / CELL), c1z = Math.floor((cam.z + CLUSTER_R) / CELL);
    const R2 = CLUSTER_R * CLUSTER_R;
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const a = cells.get(ck(cx, cz)); if (!a) continue;
      for (let j = 0; j < a.length; j++) {
        const i = a[j], dx = X[i] - cam.x, dz = Z[i] - cam.z, d2 = dx * dx + dz * dz;
        if (d2 < R2) { if (m >= candCap) growCand(); candI[m] = i; candD[m] = d2; m++; }
      }
    }
    // nearest first (stable choice when more than MAX_LIGHTS are in range)
    for (let k = 0; k < m; k++) order[k] = k;
    if (m > MAX_LIGHTS) { const ord = order.subarray(0, m); ord.sort((p, q) => candD[p] - candD[q]); m = MAX_LIGHTS; }
    const d = dataTex.image.data;
    for (let k = 0; k < m; k++) {
      const i = candI[order[k]]; sel[k] = i;
      const dist = Math.sqrt(candD[order[k]]);
      const fade = 1 - THREE.MathUtils.smoothstep(dist, CLUSTER_R - 45, CLUSTER_R);
      d[k * 4] = X[i]; d[k * 4 + 1] = Y[i]; d[k * 4 + 2] = Z[i]; d[k * 4 + 3] = RG[i];
      const o = (MAX_LIGHTS + k) * 4;
      d[o] = R[i]; d[o + 1] = G[i]; d[o + 2] = B[i]; d[o + 3] = I[i] * on * fade;
      selW[k] = I[i] * fade;
    }
    // bin into the camera-centred tile grid (snapped so tiles don't swim); per tile keep the K strongest at its center
    const ox = Math.floor(cam.x / TILE) * TILE - (GRID / 2) * TILE;
    const oz = Math.floor(cam.z / TILE) * TILE - (GRID / 2) * TILE;
    lampInfo.x = ox; lampInfo.y = oz; lampInfo.z = TILE;
    fill.fill(0);
    for (let k = 0; k < m; k++) {
      const i = sel[k], r = RG[i];
      const tx0 = Math.max(0, Math.floor((X[i] - r - ox) / TILE)), tx1 = Math.min(GRID - 1, Math.floor((X[i] + r - ox) / TILE));
      const tz0 = Math.max(0, Math.floor((Z[i] - r - oz) / TILE)), tz1 = Math.min(GRID - 1, Math.floor((Z[i] + r - oz) / TILE));
      for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
        const t = tz * GRID + tx, base = t * K;
        // contribution at the nearest point of the tile (so a lamp right at the edge ranks as strong as it looks there)
        const px = Math.min(Math.max(X[i], ox + tx * TILE), ox + (tx + 1) * TILE), pz = Math.min(Math.max(Z[i], oz + tz * TILE), oz + (tz + 1) * TILE);
        const ex = X[i] - px, ez = Z[i] - pz, ey = Y[i] - GY[i];
        const sc = selW[k] / (ex * ex + ez * ez + ey * ey + 9);
        let f = fill[t];
        if (f >= K) { if (sc <= tileS[base + K - 1]) continue; f = K - 1; } else fill[t] = f + 1;
        // insertion into the tile's list sorted by score (descending)
        while (f > 0 && tileS[base + f - 1] < sc) { tileS[base + f] = tileS[base + f - 1]; tileK[base + f] = tileK[base + f - 1]; f--; }
        tileS[base + f] = sc; tileK[base + f] = k;
      }
    }
    const gd = gridTex.image.data; gd.fill(-1);
    for (let t = 0; t < GRID * GRID; t++) {
      const tx = t % GRID, tz = (t / GRID) | 0, n2 = fill[t];
      for (let f = 0; f < n2; f++) gd[((tz * GRID * KT) + tx * KT + (f >> 2)) * 4 + (f & 3)] = tileK[t * K + f];
    }
    dataTex.needsUpdate = true; gridTex.needsUpdate = true;
    // (isTexture=false textures still upload through setTexture2D via version bump)
  };
  return api;
}

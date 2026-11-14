import * as THREE from 'three';

// Global ocean: one huge camera-following plane at sea level with
//  - multi-scale scrolling normal maps, flattened with distance (LOD normals, no shimmer on the horizon)
//  - analytic sky reflection (same gradient/glow uniforms as the sky dome -> always matches the sky)
//  - sun glitter, moon path, Fresnel, deep/shallow colour from a shoreline distance field
//  - animated shore foam bands built from city.mapLayers (land/water polygons) or city.isWater
// No planar reflection pass (the old Water.js re-rendered the whole city every frame).

const SHORE_MAX = 140; // metres encoded in the distance field

export function createOcean(game, skyUniforms, normalsTex) {
  const u = skyUniforms;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights, {
    tNormal: { value: null },
    tShore: { value: null },
    uShoreRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uHasShore: { value: 0 },
    uTime: { value: 0 },
    uWindOff: { value: new THREE.Vector2() },
    uWindChop: { value: 1 },
    uDeep: { value: new THREE.Color(0.007, 0.070, 0.062) },
    uShallow: { value: new THREE.Color(0.09, 0.47, 0.37) },
    uAmbient: { value: new THREE.Color(0.3, 0.3, 0.35) },
    uSunCol: { value: new THREE.Color(1, 1, 1) },
  }]);
  // share sky uniform objects (by reference) so the ocean always reflects the current sky
  for (const k of ['lightDir', 'lightColor', 'sunDir', 'moonDir', 'uZenith', 'uHorizon', 'uHorizonSun', 'uSunGlow', 'uNight', 'uFogColor']) uniforms[k] = u[k];
  uniforms.tNormal.value = normalsTex;

  const mat = new THREE.ShaderMaterial({
    name: 'PortSolanaOcean',
    uniforms,
    lights: true,
    fog: true,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tNormal;
      uniform sampler2D tShore;
      uniform vec4 uShoreRect;
      uniform float uHasShore;
      uniform float uTime;
      uniform vec2 uWindOff;
      uniform float uWindChop;
      uniform vec3 uDeep, uShallow, uAmbient, uSunCol;
      uniform vec3 lightDir, lightColor, sunDir, moonDir;
      uniform vec3 uZenith, uHorizon, uHorizonSun, uSunGlow, uFogColor;
      uniform float uNight;
      varying vec3 vWorld;
      #include <common>
      #include <bsdfs>
      #include <fog_pars_fragment>
      #include <lights_pars_begin>

      vec3 skyColor( vec3 dir ) {
        float hh = max( dir.y, 0.0 );
        vec3 art = mix( uHorizon, uZenith, pow( hh, 0.42 ) );
        float cosT = dot( dir, normalize( sunDir ) );
        float sunSide = pow( cosT * 0.5 + 0.5, 2.2 );
        art = mix( art, uHorizonSun, clamp( sunSide * exp( -hh * 5.0 ), 0.0, 1.0 ) );
        float cp = max( cosT, 0.0 );
        art += uSunGlow * ( pow( cp, 6.0 ) * 0.22 + pow( cp, 48.0 ) * 0.6 );
        float md = max( dot( dir, normalize( moonDir ) ), 0.0 );
        art += uNight * vec3( 0.75, 0.82, 1.0 ) * ( pow( md, 900.0 ) * 3.0 + pow( md, 60.0 ) * 0.08 ) * step( 0.0, moonDir.y );
        art += uNight * vec3( 0.035, 0.018, 0.016 ) * exp( -hh * 9.0 ); // city glow (dimmed in reflection)
        return art;
      }
      vec3 nrm( vec2 uv ) { return texture2D( tNormal, uv ).xyz * 2.0 - 1.0; }

      void main() {
        vec3 toEye = cameraPosition - vWorld;
        float dist = length( toEye );
        vec3 V = toEye / dist;
        vec2 p = vWorld.xz;
        float t = uTime;
        vec2 pw = p - uWindOff; // ripples drift downwind (game.wind); the long swell keeps its own heading
        // ---- multi-scale normals, flattened with distance ----
        vec3 n = nrm( pw / 41.0 + t * vec2( 0.012, 0.009 ) ) * 0.55
               + nrm( ( p - uWindOff * 1.6 ) / 13.0 + t * vec2( -0.021, 0.016 ) ) * 0.35
               + nrm( ( p - uWindOff * 2.2 ) / 4.3 + t * vec2( 0.033, -0.041 ) ) * 0.26 * ( 1.0 - smoothstep( 40.0, 260.0, dist ) )
               + nrm( ( p - uWindOff * 2.6 ) / 1.37 + t * vec2( -0.047, 0.052 ) ) * 0.16 * ( 1.0 - smoothstep( 8.0, 60.0, dist ) )
               + nrm( p / 197.0 + t * vec2( 0.004, -0.003 ) ) * 0.6;
        float lod = 1.0 / ( 1.0 + dist * 0.0022 );
        float lowSun = 1.0 - smoothstep( 0.08, 0.45, normalize( lightDir ).y );
        float chop = ( 0.55 + 0.35 * lowSun ) * lod * uWindChop; // choppier ripples at low sun: dark troughs, bright glitter
        vec3 N = normalize( vec3( n.x * chop, 1.0, n.y * chop ) );

        // ---- shoreline distance (0 at the coast .. 1 = SHORE_MAX m or more) ----
        float shoreD = 1.0;
        if ( uHasShore > 0.5 ) {
          vec2 suv = ( p - uShoreRect.xy ) * uShoreRect.zw;
          if ( suv.x > 0.0 && suv.y > 0.0 && suv.x < 1.0 && suv.y < 1.0 ) shoreD = texture2D( tShore, suv ).r;
        }
        float shoreM = shoreD * ${SHORE_MAX.toFixed(1)};

        // ---- reflection / refraction ----
        float NdV = max( dot( N, V ), 0.0 );
        float F = ( 0.02 + 0.98 * pow( 1.0 - NdV, 5.0 ) ) * mix( 0.55, 1.0, lowSun ); // rough daytime sea mirrors less sky: the green-teal body shows
        vec3 R = reflect( -V, N );
        R.y = abs( R.y ) + 0.01;
        vec3 refl = skyColor( normalize( R ) ) * ( 1.0 - 0.22 * lowSun );

        vec3 L = normalize( lightDir );
        float sunUp = smoothstep( -0.05, 0.05, L.y );
        float shallow = pow( 1.0 - smoothstep( 0.0, 125.0, shoreM ), 1.7 ); // turquoise shallows easing into deep teal-blue
        vec3 body = mix( uDeep, uShallow, shallow );
        body = mix( body, vec3( 0.34, 0.60, 0.46 ), ( 1.0 - smoothstep( 0.0, 16.0, shoreM ) ) * 0.55 ); // sand showing through at the beach
        vec3 amb = mix( uAmbient, vec3( dot( uAmbient, vec3( 0.3333 ) ) ), 0.65 ); // sky light without the blue cast: water keeps its green-teal body
        body *= 0.80 + 0.40 * smoothstep( -0.5, 0.5, n.x + n.y ); // wave facets read from the air
        float diff = max( dot( N, L ), 0.0 );
        vec3 water = body * ( amb + uSunCol * diff * 0.35 * sunUp );
        // subsurface glow through wave crests when looking toward the sun
        water += uShallow * uSunCol * pow( max( dot( V, -L ), 0.0 ), 4.0 ) * 0.05 * sunUp * ( 0.4 + 0.6 * shallow );

        vec3 col = mix( water, refl, F );

        // ---- sun glitter ----
        vec3 H = normalize( L + V );
        float NdH = max( dot( N, H ), 0.0 );
                col += lightColor * ( pow( NdH, 1200.0 ) * 18.0 + pow( NdH, 160.0 ) * 0.35 + pow( NdH, 36.0 ) * 0.02 * lowSun ) * F * 4.0 * sunUp;

        // ---- shore foam ----
        if ( shoreM < 30.0 ) {
          float nz = texture2D( tNormal, p / 9.0 + t * 0.02 ).r;
          float waves = sin( shoreM * 0.55 - t * 1.4 + nz * 3.0 );
          float band = smoothstep( 0.55, 0.95, waves ) * ( 1.0 - smoothstep( 4.0, 26.0, shoreM ) );
          float edge = 1.0 - smoothstep( 1.5, 9.0 + nz * 6.0, shoreM );
          float foam = clamp( band * 0.7 + edge, 0.0, 1.0 ) * smoothstep( 0.25, 0.65, nz + 0.25 );
          col = mix( col, uAmbient * 1.1 + uSunCol * 0.45 * sunUp * max( L.y, 0.15 ), foam * 0.85 );
        }

        gl_FragColor = vec4( col, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    // push the ocean slightly back in depth so land just above sea level never z-fights with it far away
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 6,
  });

  const SIZE = 60000;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ocean';
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  mesh.receiveShadow = false;
  mesh.castShadow = false;

  // ---------- shoreline distance field ----------
  let shoreState = 'none';
  // built as a generator and stepped from update() under a per-frame time budget (no load spike)
  function* buildShore(city) {
    const b = city.bounds; if (!b) return false;
    const M = 300;
    const minX = b.minX - M, minZ = b.minZ - M, maxX = b.maxX + M, maxZ = b.maxZ + M;
    const ex = maxX - minX, ez = maxZ - minZ;
    const cell = Math.max(2.5, Math.max(ex, ez) / 1536);
    const W = Math.ceil(ex / cell), H = Math.ceil(ez / cell);
    const land = new Uint8Array(W * H);
    const ml = city.mapLayers;
    if (ml && Array.isArray(ml.land) && ml.land.length) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const poly = (pts) => { g.beginPath(); pts.forEach(([x, z], i) => { const px = (x - minX) / cell, pz = (z - minZ) / cell; i ? g.lineTo(px, pz) : g.moveTo(px, pz); }); g.closePath(); g.fill(); };
      let k = 0;
      g.fillStyle = '#fff';
      for (const key of ['land', 'beach', 'park']) for (const pl of (ml[key] || [])) { if (pl && pl.length > 2) poly(pl); if (++k % 40 === 0) yield; }
      if (Array.isArray(ml.water)) { g.fillStyle = '#000'; for (const pl of ml.water) { if (pl && pl.length > 2) poly(pl); if (++k % 40 === 0) yield; } }
      const STRIP = 40;
      for (let y0 = 0; y0 < H; y0 += STRIP) {
        const h = Math.min(STRIP, H - y0);
        const px = g.getImageData(0, y0, W, h).data;
        for (let i = 0; i < W * h; i++) land[y0 * W + i] = px[i * 4] > 127 ? 1 : 0;
        yield;
      }
    } else if (typeof city.isWater === 'function') {
      for (let j = 0; j < H; j++) { for (let i = 0; i < W; i++) land[j * W + i] = city.isWater(minX + (i + 0.5) * cell, minZ + (j + 0.5) * cell) ? 0 : 1; if (j % 16 === 0) yield; }
    } else return false;
    const INF = 1e9, d = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = land[i] ? 0 : INF;
    const A = 1, B = Math.SQRT2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x; let v = d[i]; if (v === 0) continue;
        if (x > 0) v = Math.min(v, d[i - 1] + A);
        if (y > 0) { v = Math.min(v, d[i - W] + A); if (x > 0) v = Math.min(v, d[i - W - 1] + B); if (x < W - 1) v = Math.min(v, d[i - W + 1] + B); }
        d[i] = v;
      }
      if (y % 32 === 0) yield;
    }
    for (let y = H - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x; let v = d[i]; if (v === 0) continue;
        if (x < W - 1) v = Math.min(v, d[i + 1] + A);
        if (y < H - 1) { v = Math.min(v, d[i + W] + A); if (x < W - 1) v = Math.min(v, d[i + W + 1] + B); if (x > 0) v = Math.min(v, d[i + W - 1] + B); }
        d[i] = v;
      }
      if (y % 32 === 0) yield;
    }
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) { const i = y * W + x; out[i] = Math.min(255, Math.round((d[i] * cell / SHORE_MAX) * 255)); } if (y % 96 === 0) yield; }
    const tex = new THREE.DataTexture(out, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    if (uniforms.tShore.value && uniforms.tShore.value !== tex) uniforms.tShore.value.dispose(); // rebuilds never leak
    uniforms.tShore.value = tex;
    uniforms.uShoreRect.value.set(minX, minZ, 1 / (W * cell), 1 / (H * cell));
    uniforms.uHasShore.value = 1;
    return true;
  }
  let shoreJob = null;

  const ocean = {
    mesh, material: mat, uniforms,
    rebuildShore() { shoreState = 'none'; },
    update(dt, camera, env) {
      uniforms.uTime.value += dt;
      const wnd = game.wind;
      if (wnd) {
        const g = 0.55 + 1.05 * wnd.gust;
        uniforms.uWindOff.value.x += wnd.dir.x * wnd.speed * g * dt * 0.12; uniforms.uWindOff.value.y += wnd.dir.y * wnd.speed * g * dt * 0.12;
        uniforms.uWindChop.value += (THREE.MathUtils.clamp(0.72 + 0.07 * wnd.speed + 0.12 * wnd.gust, 0.7, 1.7) - uniforms.uWindChop.value) * Math.min(1, dt * 0.8);
      }
      // follow the camera, snapped (normals are world-space so snapping is invisible)
      mesh.position.set(Math.round(camera.position.x / 200) * 200, (game.city?.seaLevel ?? env.seaLevel ?? -0.12), Math.round(camera.position.z / 200) * 200);
      // lighting
      const h = env.hemi, s = env.sun;
      uniforms.uAmbient.value.copy(h.color).multiplyScalar(h.intensity * 0.9);
      uniforms.uSunCol.value.copy(s.color).multiplyScalar(s.intensity);
      if (shoreState === 'none' && game.city) { shoreState = 'pending'; shoreJob = buildShore(game.city); }
      if (shoreJob) {
        const t0 = performance.now();
        try {
          while (performance.now() - t0 < 1.5) {
            const r = shoreJob.next();
            if (r.done) { shoreState = r.value ? 'ok' : 'nodata'; shoreJob = null; break; }
          }
        } catch (e) { shoreState = 'error'; shoreJob = null; console.warn('[ocean] shore field failed', e); }
      }
    },
  };
  return ocean;
}

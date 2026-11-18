import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GradeShader } from './gradeShader.js';
import { advanceFrameNoise, FRAME_NOISE, RENDER_R2, RENDER_R2_PAGE, CAM_FOCUS } from './frameNoise.js';
import { WEATHER_U } from './wetSurfaces.js';
import { LOOK_OFF } from '../world/env/fogChunks.js';
import { LOOK_U, LOOK_V, LOOK_W, LOOK3_DEFAULT } from './look3.js';

// Pipeline (HDR linear until OutputPass, display-referred after):
// Render -> [GTAO half-res, ultra only] -> contact AO (depth only, one pass) -> UnrealBloom -> Output (ACES + sRGB) -> SMAA -> Grade (to screen)
// r2-render image-stability pass (TAA with motion vectors, disocclusion, clipping, sharpen; stable shadow taps).
// Runtime A/B: game.renderR2 = true / false. Page default: ?render2=1 / ?render2=0, else RENDER_R2_DEFAULT (frameNoise.js).
// r2-render: anisotropic filtering on every mipmapped texture created from now on (ground, roads, facades, models). three
// clamps it to the GPU's maximum and applies it only to trilinear-filtered textures (render targets and data textures keep
// theirs). Set at module load, before the city builds its materials. ?aniso=N overrides (1 = off).
{
  const q = typeof location !== 'undefined' ? location.search : '';
  const m = /[?&]aniso=(\d+)/.exec(q);
  const on = RENDER_R2_PAGE;
  const n = m ? +m[1] : on ? 8 : 0;
  if (n > 0 && THREE.Texture.DEFAULT_ANISOTROPY < n) THREE.Texture.DEFAULT_ANISOTROPY = n;
}
export function createPost(game) {
  const { renderer, scene, camera } = game;
  if (game.renderR2 === undefined) game.renderR2 = RENDER_R2_PAGE;
  // Native resolution, fixed (playtest-fixes): the full window at the display's own pixel ratio (Retina up to 2x).
  // Nothing ever scales this down at run time; speed comes from engineering, not from a blurrier picture.
  const NATIVE_PR = Math.min(window.devicePixelRatio || 1, 2);
  // the quality preset may pick a ratio between "at least 1920x1080 internal" and native (game.quality.dpr())
  const targetPR = () => {
    const q = game.quality?.dpr?.();
    return Number.isFinite(q) && q > 0 ? q : Math.min(window.devicePixelRatio || 1, 2);
  };
  renderer.setPixelRatio(NATIVE_PR);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const pr = renderer.getPixelRatio();
  let W = Math.max(1, size.x), H = Math.max(1, size.y);

  const target = new THREE.WebGLRenderTarget(W * pr, H * pr, { type: THREE.HalfFloatType, samples: 0 });
  // scene depth as a texture (cloned to both composer buffers): the contact-AO pass reads it, no extra scene render
  try { target.depthTexture = new THREE.DepthTexture(W * pr, H * pr, THREE.UnsignedIntType); target.depthTexture.format = THREE.DepthFormat; } catch (e) { console.warn('[post] no depth texture', e); }
  const composer = new EffectComposer(renderer, target);
  // RenderTarget.clone() shares the depth texture's GPU storage between both buffers (same Source): give the second its own,
  // otherwise the AO pass would sample the depth attachment of the buffer it is drawing into (feedback loop -> black frame)
  try { if (target.depthTexture) { composer.renderTarget2.depthTexture = new THREE.DepthTexture(W * pr, H * pr, THREE.UnsignedIntType); composer.renderTarget2.depthTexture.format = THREE.DepthFormat; } } catch (e) { console.warn('[post] depth texture 2', e); }

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  // the composer keeps its buffers swapped between frames: remember which depth texture this frame's scene went into
  let sceneDepth = null;
  // MSAA (per preset, look.msaa): only the scene pass renders multisampled, into its own target, and is resolved once
  // into the composer buffer. (MSAA on the composer buffers made every full-screen pass pay a resolve.)
  const msaaRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  try {
    msaaRT.depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
    msaaRT.depthTexture.format = THREE.DepthFormat;
  } catch (e) {
    console.warn('[post] msaa depth texture', e);
  }
  const resolveMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D( tDiffuse, vUv ); }',
    depthTest: false,
    depthWrite: false,
  });
  const resolveQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), resolveMat);
  resolveQuad.frustumCulled = false;
  const resolveScene = new THREE.Scene();
  resolveScene.add(resolveQuad);
  const resolveCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  {
    const rpRender = renderPass.render.bind(renderPass);
    renderPass.render = (r, wb, rb, dt, mask) => {
      LOOK_V[2] = 1; // look3.js: lit opaque materials write their ambient share to alpha (read by the AO resolve)
      try { return scenePass(r, wb, rb, dt, mask); } finally { LOOK_V[2] = 0; }
    };
    const scenePass = (r, wb, rb, dt, mask) => {
      const n = LOOK_OFF ? 0 : (game.quality?.current?.look?.msaa ?? 0);
      if (n > 0 && msaaRT.depthTexture) {
        if (msaaRT.samples !== n) {
          msaaRT.samples = n;
          msaaRT.dispose();
        }
        if (msaaRT.width !== rb.width || msaaRT.height !== rb.height) msaaRT.setSize(rb.width, rb.height);
        rpRender(r, wb, msaaRT, dt, mask);
        resolveMat.uniforms.tDiffuse.value = msaaRT.texture;
        r.setRenderTarget(rb);
        r.render(resolveScene, resolveCam);
        sceneDepth = msaaRT.depthTexture;
        return;
      }
      sceneDepth = rb.depthTexture || null;
      rpRender(r, wb, rb, dt, mask);
    };
  }

  let gtao = null;
  try {
    gtao = new GTAOPass(scene, camera, Math.floor(W / 2), Math.floor(H / 2));
    gtao.blendIntensity = 0.7;
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 8 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    const gtaoSetSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => gtaoSetSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    gtao.enabled = false;
    // GTAO's G-buffer pass calls renderer.render(): skip the (already rendered) shadow map there
    const gtaoRender = gtao.render.bind(gtao);
    gtao.render = (r, wb, rb, dt, mask) => {
      const au = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
      try { gtaoRender(r, wb, rb, dt, mask); } finally { r.shadowMap.autoUpdate = au; }
    };
    composer.addPass(gtao);
  } catch (e) { console.warn('[post] GTAO unavailable', e); gtao = null; }

  // ---------- contact AO: full-res AO pass from the depth buffer (normals rebuilt from depth) + bilateral 4x4 resolve ----------
  // Darkens creases and the ground under objects within ~1 m (+ a ~3 m contact ring with look3). No second scene render.
  // Off with game.settings.ao === false or quality 'low'; replaced by GTAO on 'ultra'.
  // r2-look (Nov 17): the single pass rotated its 10-tap kernel per pixel and per frame and multiplied the noisy result
  // straight into the image; TAA could not fully average it, so every surface near the ground carried a fixed grain
  // (calibration spheres, car bodies, house walls). Now pass 1 writes (ao, view depth) with a 4x4 interleaved kernel
  // rotation (every 4x4 block holds all 16 rotations, shifted by a golden-ratio step per frame) and pass 2 averages the
  // 4x4 block with a depth-aware weight: smooth in a single frame, TAA only removes what is left.
  let ao = null;
  try {
    if (!target.depthTexture) throw new Error('depth texture unavailable');
    const aoRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const aoMat = new THREE.ShaderMaterial({
      name: 'PortSolanaContactAO',
      uniforms: { tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProjY: { value: 1 }, uAspect: { value: 1 }, uRes: { value: new THREE.Vector2(W * pr, H * pr) }, uRadius: { value: 1.0 }, uIntensity: { value: 1.5 }, uFrameN: FRAME_NOISE, uLook3: { value: 0 }, uFar: { value: 3.2 }, uR2: { value: 1 },
        tCloud: { value: null }, uViewInv: { value: new THREE.Matrix4() }, uCloudWin: { value: new THREE.Vector4(0, 0, 1, 0) }, uCloudSun: { value: new THREE.Vector4(0, 1, 0, 0) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDepth; uniform mat4 uProjInv; uniform float uProjY, uAspect, uRadius, uIntensity, uFrameN, uLook3, uFar, uR2; uniform vec2 uRes;
        uniform sampler2D tCloud; uniform mat4 uViewInv; uniform vec4 uCloudWin; uniform vec4 uCloudSun; // win: x0, z0, size, strength; sun: dir xyz, cloud base m
        // r2-look: ground cloud shadows. The world point is moved along the sun direction up to the cloud base and looked up in
        // the cloud-coverage map (cloudShadow pass, same field as the sky). 1 = full sun.
        float cloudVis( vec3 P ) {
          if ( uCloudWin.w <= 0.0 ) return 1.0;
          vec3 wp = ( uViewInv * vec4( P, 1.0 ) ).xyz;
          vec2 q = wp.xz + uCloudSun.xz / max( uCloudSun.y, 0.08 ) * max( uCloudSun.w - wp.y, 0.0 );
          vec2 uv = ( q - uCloudWin.xy ) / uCloudWin.z;
          float edge = smoothstep( 0.0, 0.08, min( min( uv.x, uv.y ), min( 1.0 - uv.x, 1.0 - uv.y ) ) );
          return 1.0 - texture2D( tCloud, uv ).r * uCloudWin.w * edge;
        }
        varying vec2 vUv;
        vec3 viewPos( vec2 uv ) { float d = texture2D( tDepth, uv ).x; vec4 v = uProjInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); return v.xyz / v.w; }
        float bayer4( vec2 p ) { // 0..15, every 4x4 block holds each value once
          vec2 q = mod( floor( p ), 4.0 );
          float b2 = mod( q.x, 2.0 ) * 2.0 + mod( q.y + q.x, 2.0 );
          vec2 r = floor( q / 2.0 );
          float b1 = r.x * 2.0 + mod( r.y + r.x, 2.0 );
          return b2 * 4.0 + b1;
        }
        void main() {
          float d = texture2D( tDepth, vUv ).x;
          if ( d >= 0.99995 ) { gl_FragColor = vec4( 1.0, 6e4, 0.0, 1.0 ); return; }
          vec3 P = viewPos( vUv );
          float cV = cloudVis( P );
          float fade = 1.0 - smoothstep( 55.0, 130.0, -P.z );
          if ( fade <= 0.0 ) { gl_FragColor = vec4( 1.0, -P.z, cV, 1.0 ); return; }
          vec2 px = 1.0 / uRes;
          vec3 dx1 = viewPos( vUv + vec2( px.x, 0.0 ) ) - P, dx2 = P - viewPos( vUv - vec2( px.x, 0.0 ) );
          vec3 dy1 = viewPos( vUv + vec2( 0.0, px.y ) ) - P, dy2 = P - viewPos( vUv - vec2( 0.0, px.y ) );
          vec3 Nc = cross( abs( dx1.z ) < abs( dx2.z ) ? dx1 : dx2, abs( dy1.z ) < abs( dy2.z ) ? dy1 : dy2 );
          float nl = dot( Nc, Nc );
          if ( !( nl > 1e-16 ) ) { gl_FragColor = vec4( 1.0, -P.z, cV, 1.0 ); return; }
          vec3 N = Nc * inversesqrt( nl );
          float rad = clamp( uRadius * uProjY * 0.5 / max( -P.z, 0.3 ), 3.0 * px.y, 0.09 );
          float worldR = rad * 2.0 * max( -P.z, 0.3 ) / uProjY; // radius actually covered after clamping
          float n = ( uR2 > 0.5 ? fract( ( bayer4( gl_FragCoord.xy ) + 0.5 ) / 16.0 + 0.61803399 * uFrameN * uLook3 ) : fract( 52.9829189 * fract( dot( gl_FragCoord.xy + 5.588238 * uFrameN * uLook3, vec2( 0.06711056, 0.00583715 ) ) ) ) ) * 6.2831853;
          float occ = 0.0;
          for ( int i = 0; i < 10; i++ ) {
            float fi = float( i );
            float a = n + fi * 2.39996323;
            float r = sqrt( ( fi + 0.5 ) / 10.0 ) * rad;
            vec3 v = viewPos( vUv + vec2( cos( a ) / uAspect, sin( a ) ) * r ) - P;
            float d2 = dot( v, v );
            occ += max( dot( N, v ) * inversesqrt( d2 + 1e-5 ) - 0.12, 0.0 ) * max( 1.0 - d2 / ( worldR * worldR ), 0.0 );
          }
          float aoV = clamp( 1.0 - uIntensity * occ / 10.0 * 2.2, 0.0, 1.0 );
          if ( uLook3 > 0.5 ) {
            // look3: a wider ring (about 3 m) for the soft ambient darkening where objects meet the ground (cars, walls, bins)
            float radF = clamp( uFar * uProjY * 0.5 / max( -P.z, 0.3 ), 3.0 * px.y, 0.16 );
            float worldF = radF * 2.0 * max( -P.z, 0.3 ) / uProjY;
            float occF = 0.0;
            for ( int i = 0; i < 6; i++ ) {
              float fi = float( i );
              float a = n + 1.7 + fi * 2.39996323;
              float r = sqrt( ( fi + 0.5 ) / 6.0 ) * radF;
              vec3 v = viewPos( vUv + vec2( cos( a ) / uAspect, sin( a ) ) * r ) - P;
              float d2 = dot( v, v );
              occF += max( dot( N, v ) * inversesqrt( d2 + 1e-5 ) - 0.2, 0.0 ) * max( 1.0 - d2 / ( worldF * worldF ), 0.0 );
            }
            aoV *= clamp( 1.0 - occF / 6.0 * 1.25, 0.55, 1.0 );
            aoV = pow( aoV, 1.15 );
          }
          if ( !( aoV == aoV ) ) aoV = 1.0;
          gl_FragColor = vec4( mix( 1.0, aoV, fade ), -P.z, cV, 1.0 );
        }`,
      depthTest: false,
      depthWrite: false,
    });
    // r2-look: cloud coverage map for the ground cloud shadows: 512 x 512 texels over a 4 km window around the camera,
    // redrawn every frame (the clouds drift) from the same cumulus field as the sky (skyShader.js cloudShape, keep in sync)
    const cloudRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const cloudMat = new THREE.ShaderMaterial({
      name: 'PortSolanaCloudShadowMap',
      uniforms: { uWin: { value: new THREE.Vector4() }, uCam: { value: new THREE.Vector2() }, uOff: { value: new THREE.Vector2() }, uCov: { value: 0.4 }, uBase: { value: 1100 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: /* glsl */`
        uniform vec4 uWin; uniform vec2 uCam; uniform vec2 uOff; uniform float uCov; uniform float uBase;
        varying vec2 vUv;
        float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
        vec3 hash33( vec3 p3 ) { p3 = fract( p3 * vec3( 0.1031, 0.1030, 0.0973 ) ); p3 += dot( p3, p3.yxz + 33.33 ); return fract( ( p3.xxy + p3.yxx ) * p3.zyx ); }
        float vnoise( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( hash12( i ), hash12( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash12( i + vec2( 0.0, 1.0 ) ), hash12( i + vec2( 1.0, 1.0 ) ), u.x ), u.y ); }
        const mat2 ROT = mat2( 0.8, -0.6, 0.6, 0.8 );
        float fbm3( vec2 p ) { float a = 0.5, s = 0.0; for ( int i = 0; i < 3; i++ ) { s += a * vnoise( p ); p = ROT * p * 2.1 + 5.3; a *= 0.5; } return s; }
        float worley( vec2 p ) { vec2 i = floor( p ), f = fract( p ); float md = 1.0;
          for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) { vec2 g = vec2( float( x ), float( y ) ); vec2 o = hash33( vec3( i + g, 7.0 ) ).xy; md = min( md, length( g + o - f ) ); }
          return 1.0 - md; }
        float cloudShape( vec2 p ) {
          p += ( vec2( vnoise( p * 0.45 + 3.1 ), vnoise( p * 0.45 + 8.7 ) ) - 0.5 ) * 0.35; // same warp as the sky (uCloudR2)
          float base = vnoise( p * 0.33 + 31.0 ) * 0.65 + vnoise( p * 0.71 ) * 0.35;
          float cells = worley( p * 0.85 + 11.0 );
          float bil = worley( p * 3.1 + 7.0 );
          float det = fbm3( p * 5.2 + 3.0 );
          return base * 0.28 + cells * 0.39 + bil * 0.18 + det * 0.15;
        }
        void main() {
          vec2 q = uWin.xy + vUv * uWin.z;                   // world xz on the cloud layer
          vec2 p = ( q - uCam ) * 1.9 / uBase + uOff;        // the sky's own cloud coordinates (uCloudOff is world-anchored)
          float n = cloudShape( p );
          float cov = 1.03 - uCov;
          gl_FragColor = vec4( vec3( smoothstep( cov + 0.02, cov + 0.14, n ) ), 1.0 ); // the cloud cores only (r2-look: a whole yard under a cloud read flat and dark at the reference camera)
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const cloudQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cloudMat);
    cloudQuad.frustumCulled = false;
    const cloudScene = new THREE.Scene();
    cloudScene.add(cloudQuad);
    const CLOUD_WIN = 4096;
    const aoQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), aoMat);
    aoQuad.frustumCulled = false;
    const aoScene = new THREE.Scene();
    aoScene.add(aoQuad);
    const aoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    ao = new ShaderPass({
      name: 'PortSolanaContactAOResolve',
      uniforms: { tDiffuse: { value: null }, tAO: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uShare: { value: 0 }, uBlur: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform sampler2D tAO; uniform vec2 uTexel; uniform float uShare, uBlur;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D( tDiffuse, vUv );
          vec2 a0 = texture2D( tAO, vUv ).xy;
          if ( a0.y > 5e4 ) { gl_FragColor = c; return; }
          // 4x4 block (offsets -2..+1): covers all 16 kernel rotations; depth-aware so AO never bleeds across silhouettes
          float sw = 0.0, sa = 0.0, tol = 1.0 / ( 0.04 * a0.y + 0.02 );
          for ( int j = -2; j < 2; j++ ) for ( int i = -2; i < 2; i++ ) {
            vec2 t = texture2D( tAO, vUv + vec2( float( i ) + 0.5, float( j ) + 0.5 ) * uTexel ).xy;
            float w = max( 0.0, 1.0 - abs( t.y - a0.y ) * tol );
            sa += t.x * w; sw += w;
          }
          float aoV = sw > 0.01 && uBlur > 0.5 ? sa / sw : a0.x;
          float l = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          aoV = mix( aoV, 1.0, 0.5 * smoothstep( 0.8, 3.0, l ) ); // emissives and hot highlights keep their energy
          // look3: lit opaque materials store their ambient share in alpha (look3.js): AO only darkens that share,
          // the cloud shadow only the direct (sun) share
          float sh = uShare > 0.5 ? clamp( c.a, 0.0, 1.0 ) : 1.0;
          float cV = uShare > 0.5 ? texture2D( tAO, vUv ).z : 1.0;
          c.rgb *= sh * aoV + ( 1.0 - sh ) * cV;
          gl_FragColor = vec4( c.rgb, 1.0 );
        }`,
    });
    ao.material.depthTest = false; ao.material.depthWrite = false;
    ao.uniforms = new Proxy(ao.uniforms, { get: (t, k) => t[k] ?? aoMat.uniforms[k] }); // old callers tune uRadius / uIntensity / uFar here
    const aoRender = ao.render.bind(ao);
    ao.render = (r, wb, rb, dt, mask) => {
      const U = aoMat.uniforms;
      if (aoRT.width !== rb.width || aoRT.height !== rb.height) aoRT.setSize(rb.width, rb.height);
      U.tDepth.value = sceneDepth || rb.depthTexture;
      U.uProjInv.value.copy(camera.projectionMatrixInverse);
      U.uProjY.value = camera.projectionMatrix.elements[5];
      U.uAspect.value = W / H;
      U.uRes.value.set(rb.width, rb.height);
      U.uLook3.value = game.look3 && game.look3Parts?.ao !== false ? 1 : 0;
      U.uIntensity.value = game.look3 && game.lookR2 !== false ? (game.lookAOR2 ?? 1.4) : 1.5; // r2-look: contact AO (user: shade went muddy at 1.9; AO darkens contact, not whole shade areas)
      {
        // ground cloud shadows (look3 + round 2, by day, fading out with overcast where the whole sky already dims the sun)
        const env = game.env, sky = env?.sky?.material?.uniforms, sd = env?.sunDir;
        const strength = game.look3 && game.lookR2 !== false && game.lookCloudShadows !== false && sky && sd && sd.y > 0.02
          ? (game.lookCloudShadow ?? 0.45) * (env.dayFactor ?? 1) * (1 - (sky.uOvercast?.value ?? 0)) * (1 - (env.indoor || 0)) * THREE.MathUtils.smoothstep(sd.y, 0.02, 0.12) : 0;
        U.uCloudWin.value.w = strength;
        if (strength > 0) {
          const cam = camera.position, tex = CLOUD_WIN / 512, base = env.cloudBase || 1100;
          const x0 = Math.round((cam.x - CLOUD_WIN / 2) / tex) * tex, z0 = Math.round((cam.z - CLOUD_WIN / 2) / tex) * tex;
          U.uCloudWin.value.set(x0, z0, CLOUD_WIN, strength);
          U.uCloudSun.value.set(sd.x, sd.y, sd.z, base);
          const C = cloudMat.uniforms;
          C.uWin.value.set(x0, z0, CLOUD_WIN, 0); C.uCam.value.set(cam.x, cam.z); C.uOff.value.copy(sky.uCloudOff.value); C.uCov.value = sky.uCloudCover.value; C.uBase.value = base;
          r.setRenderTarget(cloudRT);
          r.render(cloudScene, aoCam);
          U.tCloud.value = cloudRT.texture;
          U.uViewInv.value.copy(camera.matrixWorld);
        }
      }
      r.setRenderTarget(aoRT);
      r.render(aoScene, aoCam);
      ao.material.uniforms.tAO.value = aoRT.texture;
      ao.material.uniforms.uTexel.value.set(1 / rb.width, 1 / rb.height);
      const r2 = game.lookR2 !== false;
      U.uR2.value = r2 ? 1 : 0;
      ao.material.uniforms.uBlur.value = r2 ? 1 : 0;
      ao.material.uniforms.uShare.value = r2 && U.uLook3.value > 0.5 && game.lookAOShare !== false ? 1 : 0; // A/B: game.lookAOShare = false
      aoRender(r, wb, rb, dt, mask);
    };
    composer.addPass(ao);
  } catch (e) { console.warn('[post] contact AO unavailable', e); ao = null; }

  // ---------- r2-look: volumetric sun shafts (humid air in-scatter, shadowed by the real sun shadow maps) ----------
  // Every pixel marches its view ray (up to 90 m, 8 steps, jittered per frame: TAA resolves it) through the near static
  // cascade (+-40 m) and the city map beyond it. Lit steps add sun in-scatter with a forward-scattering phase, so beams
  // open up through palm crowns, porch gaps and between buildings, strongest toward a low sun. Additive and small: the
  // fog keeps the overall haze. On by itself only with a low sun (morning / golden hour, where beams read; about 1 ms);
  // game.lookShafts = true forces it at any hour, false turns it off; game.lookShaftK scales it.
  let shafts = null;
  try {
    if (!target.depthTexture) throw new Error('depth texture unavailable');
    shafts = new ShaderPass({
      name: 'SouthlineSunShafts',
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() },
        tNear: { value: null }, uNearM: { value: new THREE.Matrix4() }, tFar: { value: null }, uFarM: { value: new THREE.Matrix4() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uK: { value: 0 }, uFrameN: FRAME_NOISE },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform mat4 uProjInv, uViewInv, uNearM, uFarM;
        uniform sampler2D tNear; uniform sampler2D tFar; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uK, uFrameN;
        varying vec2 vUv;
        float lit( sampler2D m, mat4 M, vec3 w, out bool inside ) {
          vec4 sc = M * vec4( w, 1.0 ); sc.xyz /= sc.w;
          inside = all( greaterThan( sc.xy, vec2( 0.01 ) ) ) && all( lessThan( sc.xy, vec2( 0.99 ) ) ) && sc.z < 1.0;
          return step( sc.z - 0.0008, unpackRGBAToDepth( texture2D( m, sc.xy ) ) );
        }
        void main() {
          vec4 c = texture2D( tDiffuse, vUv );
          float d = texture2D( tDepth, vUv ).x;
          vec4 v = uProjInv * vec4( vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); vec3 P = v.xyz / v.w;
          float L = min( length( P ), 90.0 );
          vec3 dirV = normalize( P );
          vec3 o = ( uViewInv * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz, dw = normalize( ( uViewInv * vec4( dirV, 0.0 ) ).xyz );
          float cosT = dot( dw, uSunDir );
          float g = 0.72, ph = ( 1.0 - g * g ) / pow( 1.0 + g * g - 2.0 * g * cosT, 1.5 ) * 0.0796; // Henyey-Greenstein
          float j = fract( fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) + 0.61803399 * uFrameN );
          float acc = 0.0; const int N = 8;
          for ( int i = 0; i < N; i++ ) {
            float t = ( float( i ) + j ) / float( N ); t = t * t * L; // denser near the camera
            vec3 w = o + dw * t; bool inN, inF;
            float ln = lit( tNear, uNearM, w, inN );
            acc += inN ? ln : lit( tFar, uFarM, w, inF );
          }
          acc /= float( N );
          c.rgb += uSunCol * ( acc * ph * uK * L );
          gl_FragColor = c;
        }`,
    });
    shafts.material.depthTest = false; shafts.material.depthWrite = false;
    const shRender = shafts.render.bind(shafts);
    shafts.render = (r, wb, rb, dt, mask) => {
      const U = shafts.uniforms, env = game.env;
      U.tDepth.value = sceneDepth || rb.depthTexture;
      U.uProjInv.value.copy(camera.projectionMatrixInverse);
      U.uViewInv.value.copy(camera.matrixWorld);
      U.tNear.value = env.sunNear.shadow.map.texture; U.uNearM.value.copy(env.sunNear.shadow.matrix);
      U.tFar.value = env.sun.shadow.map.texture; U.uFarM.value.copy(env.sun.shadow.matrix);
      U.uSunDir.value.copy(env.sunDir);
      U.uSunCol.value.copy(env.sun.color).multiplyScalar(env.sun.intensity);
      shRender(r, wb, rb, dt, mask);
    };
    shafts.enabled = false;
    composer.addPass(shafts);
  } catch (e) { console.warn('[post] sun shafts unavailable', e); shafts = null; }

  // Sanitize the HDR image before bloom: a single NaN / Inf pixel (an overflowing specular or emissive highlight, a 0/0 in
  // some material) gets spread by bloom's down-sampled blur into flickering black squares. Replace non-finite values and
  // clamp absurd intensities (half-float max is 65504) so one bad pixel can never poison a whole block of the screen.
  const sanitize = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uMax: { value: 48.0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uMax; varying vec2 vUv;
      bool bad(float v) { return !(v == v) || abs(v) > 6.0e4; } // NaN fails v == v; Inf / overflow is huge
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        if (bad(c.r) || bad(c.g) || bad(c.b) || bad(c.a)) c = vec4(0.0, 0.0, 0.0, 1.0);
        c.rgb = clamp(c.rgb, 0.0, uMax);
        gl_FragColor = c;
      }`,
  });
  sanitize.material.depthTest = false; sanitize.material.depthWrite = false;
  composer.addPass(sanitize);
  game.postSanitize = sanitize;

  // ---------- stage 1 weather: wet-ground screen-space reflections ----------
  // GTA's rainy night: lit windows, neon, lamps and headlights stretch across wet streets. Only upward-facing ground
  // (normal rebuilt from depth) reflects, by wetness and puddles (same puddle noise as src/render/wetSurfaces.js).
  // A view-space ray march through the depth buffer (20 steps, jittered per frame so TAA smooths it). Runs only while
  // WEATHER_U.x (wetness) > 0, before TAA and bloom (HDR).
  let ssr = null;
  try {
    if (!target.depthTexture) throw new Error('depth texture unavailable');
    ssr = new ShaderPass({
      name: 'SouthlineWetSSR',
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2(1, 1) }, uWeather: { value: WEATHER_U }, uFrameN: FRAME_NOISE, uLook3: { value: 0 }, uSkyCol: { value: new THREE.Color() } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform mat4 uProj, uProjInv, uViewInv; uniform vec2 uRes; uniform vec4 uWeather; uniform float uFrameN, uLook3; uniform vec3 uSkyCol;
        varying vec2 vUv;
        vec3 viewPos( vec2 uv ) { float d = texture2D( tDepth, uv ).x; vec4 v = uProjInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); return v.xyz / v.w; }
        float wHash( vec2 p ) { p = fract( p * vec2( 123.34, 345.45 ) ); p += dot( p, p + 34.345 ); return fract( p.x * p.y ); }
        float wNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( wHash( i ), wHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( wHash( i + vec2( 0.0, 1.0 ) ), wHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
        void main() {
          vec4 c = texture2D( tDiffuse, vUv );
          float d0 = texture2D( tDepth, vUv ).x;
          if ( d0 >= 0.99995 ) { gl_FragColor = c; return; }
          vec3 P = viewPos( vUv );
          if ( -P.z > 140.0 ) { gl_FragColor = c; return; }
          vec2 px = 1.0 / uRes;
          vec3 dx = viewPos( vUv + vec2( px.x, 0.0 ) ) - P, dy = viewPos( vUv + vec2( 0.0, px.y ) ) - P;
          vec3 N = normalize( cross( dx, dy ) );
          vec3 Nw = ( uViewInv * vec4( N, 0.0 ) ).xyz;
          if ( Nw.y < 0.0 ) { N = -N; Nw = -Nw; }
          float up = smoothstep( 0.86, 0.97, Nw.y );
          if ( up <= 0.0 ) { gl_FragColor = c; return; }
          vec3 Pw = ( uViewInv * vec4( P, 1.0 ) ).xyz;
          float pn = wNoise( Pw.xz * 0.11 ) * 0.65 + wNoise( Pw.xz * 0.43 + 7.0 ) * 0.35;
          float puddle = uWeather.y * smoothstep( 0.52, 0.66, pn + 0.18 * uWeather.y );
          // grass and planting do not mirror (green-dominant pixel, same idea as the wet material patch)
          float leafy = smoothstep( 0.005, 0.04, c.g - max( c.r, c.b ) * 0.95 );
          puddle *= 1.0 - leafy;
          // the plain wet film is a faint, patchy sheen (rough surfaces don't mirror); only puddles mirror clearly.
          // Sand-colored ground (bright, warm) soaks the rain up and barely reflects (user: the beach looked like glass)
          float lumC = dot( c.rgb, vec3( 0.299, 0.587, 0.114 ) );
          float sandC = smoothstep( 0.03, 0.1, c.r - c.b ) * smoothstep( 0.18, 0.35, lumC / ( 1.0 + lumC ) );
          float patchC = smoothstep( 0.35, 0.75, wNoise( Pw.xz * 0.045 + 3.1 ) * 0.7 + wNoise( Pw.xz * 0.21 ) * 0.3 );
          puddle *= 1.0 - 0.7 * sandC;
          float amt = up * ( mix( 0.06, 0.13, uLook3 ) * patchC * uWeather.x * ( 1.0 - 0.85 * leafy ) * ( 1.0 - 0.8 * sandC ) + mix( 0.7, 0.95, uLook3 ) * puddle );
          if ( amt < 0.01 ) { gl_FragColor = c; return; }
          // reflect about world up (wet ground is flat at this scale)
          vec3 upV = normalize( ( vec4( 0.0, 1.0, 0.0, 0.0 ) * uViewInv ).xyz );
          vec3 V = normalize( P );
          vec3 R = reflect( V, upV );
          float jit = fract( 52.9829189 * fract( dot( gl_FragCoord.xy + 5.588238 * uFrameN, vec2( 0.06711056, 0.00583715 ) ) ) );
          vec3 hitC = vec3( 0.0 ); float hitA = 0.0;
          float t = 0.25 + 0.35 * jit;
          for ( int i = 0; i < 20; i++ ) {
            vec3 Q = P + R * t;
            vec4 cq = uProj * vec4( Q, 1.0 ); vec2 uv = cq.xy / cq.w * 0.5 + 0.5;
            if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || cq.w <= 0.0 ) break;
            float sz = viewPos( uv ).z;
            float dz = sz - Q.z;                      // > 0: the ray is behind the visible surface
            if ( dz > 0.0 && dz < 0.6 + t * 0.08 ) {
              vec2 e = smoothstep( 0.0, 0.12, uv ) * smoothstep( 1.0, 0.88, uv );
              hitC = texture2D( tDiffuse, uv ).rgb; hitA = e.x * e.y * ( 1.0 - float( i ) / 20.0 );
              break;
            }
            t *= 1.32;
          }
          // look3: a ray that leaves the screen or finds nothing reflects the sky (puddles and wheel paths keep their sheen)
          if ( uLook3 > 0.5 && hitA < 0.999 ) {
            float skyW = ( 1.0 - hitA ) * smoothstep( -0.05, 0.25, dot( R, upV ) );
            hitC = mix( uSkyCol, hitC, hitA ); hitA = max( hitA, skyW * 0.85 );
          }
          float fres = 0.04 + 0.96 * pow( 1.0 - max( dot( -V, upV ), 0.0 ), 5.0 );
          float k = amt * hitA * mix( 0.35, 1.0, fres ) * ( 1.0 - smoothstep( 90.0, 140.0, -P.z ) );
          c.rgb = mix( c.rgb, c.rgb * ( 1.0 - 0.5 * k ) + hitC * k, 1.0 );
          gl_FragColor = c;
        }`,
    });
    ssr.material.depthTest = false; ssr.material.depthWrite = false;
    const ssrRender = ssr.render.bind(ssr);
    ssr.render = (r, wb, rb, dt, mask) => {
      const U = ssr.uniforms;
      U.tDepth.value = sceneDepth || rb.depthTexture;
      U.uProj.value.copy(camera.projectionMatrix);
      U.uProjInv.value.copy(camera.projectionMatrixInverse);
      U.uViewInv.value.copy(camera.matrixWorld);
      U.uRes.value.set(rb.width, rb.height);
      U.uLook3.value = game.look3 ? 1 : 0;
      if (scene.fog) U.uSkyCol.value.copy(scene.fog.color).multiplyScalar(1.1);
      ssrRender(r, wb, rb, dt, mask);
    };
    ssr.enabled = false;
    composer.addPass(ssr);
  } catch (e) { console.warn('[post] wet SSR unavailable', e); ssr = null; }

  // ---------- look track: TAA (VFX_NOTES #4) ----------
  // The camera projection is jittered by a Halton(2,3) sub-pixel offset each frame. This pass blends the new HDR frame
  // with a reprojected history: depth plus the previous view-projection (static world), with a second history tap at
  // the same UV for camera-attached objects (car, player). Each tap is clamped to the 3x3 YCoCg neighborhood and the
  // one closer to it wins. Luma-weighted blend (no fireflies). Runs at the internal render scale. With TAA on, SMAA is
  // skipped and the grade's sharpen is raised.
  let taa = null;
  try {
    if (!target.depthTexture) throw new Error('depth texture unavailable');
    const hOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const hist = [new THREE.WebGLRenderTarget(4, 4, hOpts), new THREE.WebGLRenderTarget(4, 4, hOpts)];
    const taaMat = new THREE.ShaderMaterial({
      name: 'PortSolanaTAA',
      uniforms: {
        tCur: { value: null },
        tHist: { value: null },
        tDepth: { value: null },
        uInvVP: { value: new THREE.Matrix4() },
        uPrevVP: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uReset: { value: 1 },
        uBlend: { value: 0.1 },
        uR2: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tCur;
        uniform sampler2D tHist;
        uniform sampler2D tDepth;
        uniform mat4 uInvVP;
        uniform mat4 uPrevVP;
        uniform vec2 uTexel;
        uniform float uReset;
        uniform float uBlend;
        uniform float uR2;
        varying vec2 vUv;
        vec3 toY( vec3 c ) { return vec3( 0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b ); }
        vec3 fromY( vec3 y ) { return vec3( y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z ); }
        vec3 tm( vec3 c ) { return c / ( 1.0 + max( c.r, max( c.g, c.b ) ) ); }
        vec3 itm( vec3 c ) { return c / max( 1.0 - max( c.r, max( c.g, c.b ) ), 1e-3 ); }
        // 5-tap bicubic Catmull-Rom history fetch: keeps the history sharp (bilinear re-sampling blurs it every frame)
        vec3 histCR( vec2 uv ) {
          vec2 tsz = 1.0 / uTexel;
          vec2 sp = uv * tsz;
          vec2 tp = floor( sp - 0.5 ) + 0.5;
          vec2 f = sp - tp;
          vec2 w0 = f * ( -0.5 + f * ( 1.0 - 0.5 * f ) );
          vec2 w1 = 1.0 + f * f * ( -2.5 + 1.5 * f );
          vec2 w2 = f * ( 0.5 + f * ( 2.0 - 1.5 * f ) );
          vec2 w3 = f * f * ( -0.5 + 0.5 * f );
          vec2 w12 = w1 + w2;
          vec2 tc12 = ( tp + w2 / w12 ) * uTexel;
          vec2 tc0 = ( tp - 1.0 ) * uTexel;
          vec2 tc3 = ( tp + 2.0 ) * uTexel;
          vec3 r = texture2D( tHist, vec2( tc12.x, tc0.y ) ).rgb * ( w12.x * w0.y )
            + texture2D( tHist, vec2( tc0.x, tc12.y ) ).rgb * ( w0.x * w12.y )
            + texture2D( tHist, vec2( tc12.x, tc12.y ) ).rgb * ( w12.x * w12.y )
            + texture2D( tHist, vec2( tc3.x, tc12.y ) ).rgb * ( w3.x * w12.y )
            + texture2D( tHist, vec2( tc12.x, tc3.y ) ).rgb * ( w12.x * w3.y );
          float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
          return max( r / ws, 0.0 );
        }
        void main() {
          vec3 cur = tm( texture2D( tCur, vUv ).rgb );
          if ( uReset > 0.5 ) { gl_FragColor = vec4( itm( cur ), 1.0 ); return; }
          vec3 yc = toY( cur );
          vec3 mn = yc;
          vec3 mx = yc;
          vec3 m1 = yc;
          vec3 m2 = yc * yc;
          // r2-look: full 3x3 neighborhood. The variance box (gamma 1.25) is blended a quarter of the way toward the min/max
          // box: thin high-contrast detail (leaf edges, fence wires, blinds) keeps its history instead of being clamped
          // back to the noisy current frame every frame (that left dither dots and crawling edges)
          for ( int j = -1; j <= 1; j++ ) for ( int i = -1; i <= 1; i++ ) {
            if ( i == 0 && j == 0 ) continue;
            if ( uR2 < 0.5 && i != 0 && j != 0 ) continue; // A/B: the overnight 4-tap cross
            vec3 y = toY( tm( texture2D( tCur, vUv + vec2( float( i ), float( j ) ) * uTexel ).rgb ) );
            mn = min( mn, y );
            mx = max( mx, y );
            m1 += y;
            m2 += y * y;
          }
          float nN = uR2 > 0.5 ? 9.0 : 5.0, gS = uR2 > 0.5 ? 1.25 : 1.0;
          vec3 mu = m1 / nN;
          vec3 sd = sqrt( max( m2 / nN - mu * mu, 0.0 ) );
          vec3 vmn = max( mn, mu - gS * sd ), vmx = min( mx, mu + gS * sd );
          mn = mix( vmn, mn, 0.25 * uR2 );
          mx = mix( vmx, mx, 0.25 * uR2 );
          float d = texture2D( tDepth, vUv ).x;
          vec4 w = uInvVP * vec4( vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
          vec4 pc = uPrevVP * w;
          vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
          bool inside = pc.w > 0.0 && all( greaterThanEqual( puv, vec2( 0.0 ) ) ) && all( lessThanEqual( puv, vec2( 1.0 ) ) );
          vec3 hA = toY( tm( histCR( puv ) ) );
          vec3 hB = toY( tm( texture2D( tHist, vUv ).rgb ) );
          vec3 cA = clamp( hA, mn, mx );
          vec3 cB = clamp( hB, mn, mx );
          float eA = inside ? length( cA - hA ) : 1e3;
          float eB = length( cB - hB );
          vec3 h = eA <= eB ? cA : cB;
          float a = uBlend;
          // fast motion: trust the new frame more
          a = mix( a, uR2 > 0.5 ? 0.25 : 0.5, clamp( length( ( puv - vUv ) / uTexel ) / ( uR2 > 0.5 ? 60.0 : 40.0 ), 0.0, 1.0 ) * step( eB, eA ) ); // r2-look: was 0.5 at 40 px (noise came back while driving)
          float wc = a / ( 1.0 + yc.x );
          float wh = ( 1.0 - a ) / ( 1.0 + h.x );
          vec3 o = ( yc * wc + h * wh ) / ( wc + wh );
          gl_FragColor = vec4( itm( max( fromY( o ), 0.0 ) ), 1.0 );
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const copyMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D( tDiffuse, vUv ); }',
      depthTest: false,
      depthWrite: false,
    });
    // ---------- r2-render (game.renderR2): TAA with motion vectors, disocclusion rejection, YCoCg variance clipping ----------
    // 1. Velocity pass: only the moving objects (vehicles, characters: the shadow module's dynamic layer) are drawn again
    //    with a tiny shader into a half-float target: rg = screen motion since the last frame (per-object previous world
    //    matrix), b = view depth, a = expected previous view depth. Static world pixels reproject from depth as before.
    // 2. Resolve: history fetched where the surface really was last frame (velocity, dilated to the nearest moving surface
    //    in a 5-tap cross so moving silhouettes carry their own motion), rejected when the depth stored with the history
    //    (alpha) does not match (disocclusion: no ghost trails behind cars and people), clipped (not clamped) toward the
    //    3x3 YCoCg mean inside the variance box, and blended with luma weights.
    // 3. Output: a clamped 5-tap sharpen in tone-mapped space (CAS-like, never rings); the history itself stays unsharpened.
    const taaMat3 = new THREE.ShaderMaterial({
      name: 'SouthlineTAA3',
      uniforms: {
        tCur: { value: null }, tHist: { value: null }, tDepth: { value: null }, tVel: { value: null },
        uInvVP: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2(1, 1) },
        uReset: { value: 1 }, uVelOn: { value: 0 }, uNear: { value: 0.25 }, uFar: { value: 3000 }, uBlendRest: { value: 0.08 }, uDisocc: { value: 1 }, uBoxMix: { value: 0.5 }, uCross: { value: 0 }, uJitPx: { value: new THREE.Vector2() }, uFilter: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tCur; uniform sampler2D tHist; uniform sampler2D tDepth; uniform sampler2D tVel;
        uniform mat4 uInvVP; uniform mat4 uPrevVP; uniform vec2 uTexel; uniform float uReset, uVelOn, uNear, uFar, uBlendRest, uDisocc, uBoxMix, uCross, uFilter; uniform vec2 uJitPx;
        float linZ( vec2 uv ) { float d = texture2D( tDepth, uv ).x; return d >= 0.99995 ? 6.0e4 : -perspectiveDepthToViewZ( d, uNear, uFar ); }
        varying vec2 vUv;
        vec3 toY( vec3 c ) { return vec3( 0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b ); }
        vec3 fromY( vec3 y ) { return vec3( y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z ); }
        vec3 tm( vec3 c ) { return c / ( 1.0 + max( c.r, max( c.g, c.b ) ) ); }
        vec3 itm( vec3 c ) { return c / max( 1.0 - max( c.r, max( c.g, c.b ) ), 1e-3 ); }
        vec3 histCR( vec2 uv ) {
          vec2 tsz = 1.0 / uTexel, sp = uv * tsz, tp = floor( sp - 0.5 ) + 0.5, f = sp - tp;
          vec2 w0 = f * ( -0.5 + f * ( 1.0 - 0.5 * f ) ), w1 = 1.0 + f * f * ( -2.5 + 1.5 * f ), w2 = f * ( 0.5 + f * ( 2.0 - 1.5 * f ) ), w3 = f * f * ( -0.5 + 0.5 * f );
          vec2 w12 = w1 + w2, tc12 = ( tp + w2 / w12 ) * uTexel, tc0 = ( tp - 1.0 ) * uTexel, tc3 = ( tp + 2.0 ) * uTexel;
          vec3 r = texture2D( tHist, vec2( tc12.x, tc0.y ) ).rgb * ( w12.x * w0.y ) + texture2D( tHist, vec2( tc0.x, tc12.y ) ).rgb * ( w0.x * w12.y )
            + texture2D( tHist, vec2( tc12.x, tc12.y ) ).rgb * ( w12.x * w12.y ) + texture2D( tHist, vec2( tc3.x, tc12.y ) ).rgb * ( w3.x * w12.y )
            + texture2D( tHist, vec2( tc12.x, tc3.y ) ).rgb * ( w12.x * w3.y );
          float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
          return max( r / ws, 0.0 );
        }
        // the history depth (alpha) of the 2x2 texels around uv that best matches the expected depth
        float histDepthErr( vec2 uv, float expD ) {
          vec2 p = uv / uTexel - 0.5, b = floor( p );
          float e = 1e9;
          for ( int j = 0; j < 2; j++ ) for ( int i = 0; i < 2; i++ ) {
            float hd = texture2D( tHist, ( b + vec2( float( i ), float( j ) ) + 0.5 ) * uTexel ).a;
            e = min( e, abs( hd - expD ) );
          }
          return e;
        }
        // clip h toward the box center c (Playdead): keeps the hue of the history instead of a per-channel clamp
        vec3 clipBox( vec3 h, vec3 mn, vec3 mx ) {
          vec3 c = 0.5 * ( mx + mn ), e = 0.5 * ( mx - mn ) + 1e-5, v = h - c, u = abs( v / e );
          float m = max( u.x, max( u.y, u.z ) );
          return m > 1.0 ? c + v / m : h;
        }
        void main() {
          float d = texture2D( tDepth, vUv ).x;
          float vz = d >= 0.99995 ? 6.0e4 : -perspectiveDepthToViewZ( d, uNear, uFar );
          vec3 cur = tm( texture2D( tCur, vUv ).rgb );
          if ( uReset > 0.5 ) { gl_FragColor = vec4( itm( cur ), vz ); return; }
          vec3 yc = toY( cur ), mn = yc, mx = yc, m1 = yc, m2 = yc * yc;
          // reconstruction filter (r2-render, after the QA's "dotted" deck): the new sample is the 3x3 weighted by each
          // tap's distance to this pixel's center after the jitter (Blackman-Harris fit, as UE4): a smooth, stable
          // 1.5 px footprint instead of one point sample per frame, which left 1-px steps and texture sparkle at rest
          vec2 jo = uJitPx; float fw0 = exp( -2.29 * dot( jo, jo ) ), fwS = fw0; vec3 yF = yc * fw0;
          for ( int j = -1; j <= 1; j++ ) for ( int i = -1; i <= 1; i++ ) {
            if ( i == 0 && j == 0 ) continue;
            if ( uCross > 0.5 && i != 0 && j != 0 ) continue; // Medium / Low: 5-tap cross (r2-perf: GPU cost)
            vec3 y = toY( tm( texture2D( tCur, vUv + vec2( float( i ), float( j ) ) * uTexel ).rgb ) );
            mn = min( mn, y ); mx = max( mx, y ); m1 += y; m2 += y * y;
            vec2 dd = vec2( float( i ), float( j ) ) + jo; float fw = exp( -2.29 * dot( dd, dd ) ); yF += y * fw; fwS += fw;
          }
          if ( uFilter > 0.5 ) yc = yF / fwS;
          float nN = uCross > 0.5 ? 5.0 : 9.0;
          vec3 mu = m1 / nN, sd = sqrt( max( m2 / nN - mu * mu, 0.0 ) );
          // moving surface: nearest velocity sample in a 5-tap cross (dilated silhouettes), only where it is not hidden
          vec4 vel = vec4( 0.0 );
          if ( uVelOn > 0.5 ) {
            float bz = 1e9;
            for ( int k = 0; k < 5; k++ ) {
              vec2 o = k == 0 ? vec2( 0.0 ) : k == 1 ? vec2( 1.0, 0.0 ) : k == 2 ? vec2( -1.0, 0.0 ) : k == 3 ? vec2( 0.0, 1.0 ) : vec2( 0.0, -1.0 );
              vec4 s = texture2D( tVel, vUv + o * uTexel );
              if ( s.a > 0.0 && s.b < bz ) { bz = s.b; vel = s; }
            }
            if ( vel.a > 0.0 && vel.b > vz + 0.02 * vz + 0.08 ) vel = vec4( 0.0 ); // behind the visible surface
          }
          vec2 puv; float expD;
          if ( vel.a > 0.0 ) { puv = vUv - vel.rg; expD = vel.a; }
          else {
            vec4 w = uInvVP * vec4( vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
            vec4 pc = uPrevVP * w;
            puv = pc.xy / pc.w * 0.5 + 0.5; expD = d >= 0.99995 ? 6.0e4 : pc.w;
          }
          bool inside = all( greaterThanEqual( puv, vec2( 0.0 ) ) ) && all( lessThanEqual( puv, vec2( 1.0 ) ) );
          if ( !inside ) { gl_FragColor = vec4( itm( cur ), vz ); return; }
          float motion = length( ( puv - vUv ) / uTexel );
          // disocclusion: the history pixel at puv belonged to another surface
          // edges are exempt: under the sub-pixel jitter an edge pixel flips between the near and the far surface every
          // frame, so its history legitimately holds the other depth. The local depth range of the 3x3 (relative) widens
          // the tolerance there; a real disocclusion (the ground behind a moving car) has a flat neighborhood.
          float disocc = 0.0;
          if ( uDisocc > 0.5 && expD < 5.0e4 ) {
            float zx0 = linZ( vUv + vec2( uTexel.x, 0.0 ) ), zx1 = linZ( vUv - vec2( uTexel.x, 0.0 ) ), zy0 = linZ( vUv + vec2( 0.0, uTexel.y ) ), zy1 = linZ( vUv - vec2( 0.0, uTexel.y ) );
            float zr = max( max( abs( zx0 - vz ), abs( zx1 - vz ) ), max( abs( zy0 - vz ), abs( zy1 - vz ) ) );
            float tol = 0.03 * expD + 0.06 + min( zr, 1.0e4 ) * 1.5;
            disocc = smoothstep( tol, tol * 2.5 + 0.15, histDepthErr( puv, expD ) );
          }
          // variance box: wide at rest (thin detail keeps its history), tight in motion; never wider than min / max
          float g = mix( mix( 1.25, 0.9, clamp( motion / 6.0, 0.0, 1.0 ) ), 0.6, disocc );
          vec3 bmn = max( mn, mu - g * sd ), bmx = min( mx, mu + g * sd );
          // at rest the box opens toward the full min / max of the 3x3: textured surfaces and thin detail keep their
          // converged history instead of following the jitter wobble of the new frame (that read as a crawling grain)
          float rest = ( 1.0 - clamp( motion / 2.0, 0.0, 1.0 ) ) * ( 1.0 - disocc ) * uBoxMix;
          bmn = mix( bmn, mn, rest ); bmx = mix( bmx, mx, rest );
          vec3 hY = toY( tm( histCR( puv ) ) );
          vec3 h = clipBox( hY, bmn, bmx );
          float a = mix( uBlendRest, 0.2, clamp( motion / 24.0, 0.0, 1.0 ) );
          a = mix( a, 0.6, disocc ); // not 1: sub-pixel wires and leaf tips flip between surfaces under jitter and must keep some history
          float wc = a / ( 1.0 + yc.x ), wh = ( 1.0 - a ) / ( 1.0 + h.x );
          vec3 o = ( yc * wc + h * wh ) / ( wc + wh );
          gl_FragColor = vec4( itm( max( fromY( o ), 0.0 ) ), vz );
        }`,
      depthTest: false,
      depthWrite: false,
    });
    // output of the resolve: clamped sharpen in tone-mapped space (alpha 1: later passes never see the stored depth)
    const sharpMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uSharp: { value: 0.3 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uSharp; varying vec2 vUv;
        vec3 tm( vec3 c ) { return c / ( 1.0 + max( c.r, max( c.g, c.b ) ) ); }
        vec3 itm( vec3 c ) { return c / max( 1.0 - max( c.r, max( c.g, c.b ) ), 1e-3 ); }
        void main() {
          vec3 c = tm( texture2D( tDiffuse, vUv ).rgb );
          vec3 a = tm( texture2D( tDiffuse, vUv + vec2( uTexel.x, 0.0 ) ).rgb ), b = tm( texture2D( tDiffuse, vUv - vec2( uTexel.x, 0.0 ) ).rgb );
          vec3 e = tm( texture2D( tDiffuse, vUv + vec2( 0.0, uTexel.y ) ).rgb ), f = tm( texture2D( tDiffuse, vUv - vec2( 0.0, uTexel.y ) ).rgb );
          vec3 mn = min( c, min( min( a, b ), min( e, f ) ) ), mx = max( c, max( max( a, b ), max( e, f ) ) );
          // CAS-style: less sharpening where the local contrast is already high (no halos on hard edges)
          vec3 amp = sqrt( clamp( min( mn, 1.0 - mx ) / max( mx, 1e-4 ), 0.0, 1.0 ) );
          vec3 o = c + ( c - 0.25 * ( a + b + e + f ) ) * uSharp * amp * 2.0;
          gl_FragColor = vec4( itm( clamp( o, mn, mx ) ), 1.0 );
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const copy1Mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = vec4( texture2D( tDiffuse, vUv ).rgb, 1.0 ); }',
      depthTest: false, depthWrite: false,
    });
    const velRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
    const velMat = new THREE.ShaderMaterial({
      name: 'SouthlineVelocity',
      uniforms: { uPrevModel: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uCurVP: { value: new THREE.Matrix4() }, uSkip: { value: 0 } },
      vertexShader: /* glsl */`
        #include <common>
        #include <batching_pars_vertex>
        #include <skinning_pars_vertex>
        uniform mat4 uPrevModel; uniform mat4 uPrevVP; uniform mat4 uCurVP;
        varying vec4 vCur; varying vec4 vPrev; varying float vVz;
        void main() {
          #include <batching_vertex>
          #include <skinbase_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          vec4 lp = vec4( transformed, 1.0 );
          #ifdef USE_BATCHING
          lp = batchingMatrix * lp;
          #endif
          #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
          #endif
          vec4 wp = modelMatrix * lp, mv = viewMatrix * wp;
          vVz = -mv.z;
          gl_Position = projectionMatrix * mv;
          vCur = uCurVP * wp; // unjittered: motion only, the jitter stays out of the history fetch
          vPrev = uPrevVP * ( uPrevModel * lp );
        }`,
      fragmentShader: /* glsl */`
        uniform float uSkip; varying vec4 vCur; varying vec4 vPrev; varying float vVz;
        void main() {
          if ( uSkip > 0.5 ) discard;
          vec2 c = vCur.xy / vCur.w, p = vPrev.xy / max( vPrev.w, 1e-4 );
          gl_FragColor = vec4( ( c - p ) * 0.5, vVz, max( vPrev.w, 1e-3 ) );
        }`,
      side: THREE.DoubleSide,
    });
    // previous world matrix per drawn object (two slots: several material groups of one object read the same previous one)
    const prevM = new WeakMap();
    let velFrame = 0;
    velMat.onBeforeRender = (r, s, c, g, obj, group) => {
      let e = prevM.get(obj);
      if (!e) { e = { cur: obj.matrixWorld.clone(), prev: obj.matrixWorld.clone(), f: velFrame, pf: -9 }; prevM.set(obj, e); }
      if (e.f !== velFrame) { e.prev.copy(e.cur); e.pf = e.f; e.cur.copy(obj.matrixWorld); e.f = velFrame; }
      velMat.uniforms.uPrevModel.value.copy(e.pf >= 0 ? e.prev : obj.matrixWorld); // last drawn = previous (its root was still in between)
      const om = Array.isArray(obj.material) ? obj.material[group?.materialIndex ?? 0] : obj.material;
      velMat.uniforms.uSkip.value = !om || om.transparent || om.visible === false || om.colorWrite === false ? 1 : 0; // glass: what is seen through it is not the car
      velMat.uniformsNeedUpdate = true;
    };
    // proxy scene: the dynamic top-level children (re-listed twice a second), drawn without reparenting them
    const velScene = new THREE.Scene();
    velScene.matrixWorldAutoUpdate = false;
    velScene.overrideMaterial = velMat;
    let velRoots = [], velListT = 0;
    const DYN_BIT = 1 << 7; // env/shadows.js LAYER_DYNAMIC: vehicles and anything with a skinned mesh
    // candidates: dynamic top-level children, or the children of a container group (all peds under one group): each
    // candidate is drawn only on frames where it actually moved (parked cars and idle people cost nothing; static
    // reprojection already gives them the right history)
    function listDynamic() {
      const out = [];
      const push = (c, depth) => {
        if (!c.visible) return;
        if (depth < 2 && c.children.length > 6 && !c.children.some((k) => k.isMesh)) { for (const k of c.children) push(k, depth + 1); return; }
        let dyn = false, n = 0;
        c.traverse((o) => { if (dyn || n > 400) return; if (o.isMesh) { n++; if (o.layers.mask & DYN_BIT) dyn = true; } });
        if (dyn) out.push(c);
      };
      for (const c of scene.children) if (c !== game.city?.root) push(c, 0);
      return out;
    }
    const moveM = new WeakMap(), velDraw = [];
    function movingRoots() {
      velDraw.length = 0;
      for (const c of velRoots) {
        if (!c.visible || !c.parent) continue;
        const e = c.matrixWorld.elements;
        let m = moveM.get(c);
        if (!m) { m = { e: e.slice(), still: 99 }; moveM.set(c, m); }
        let moved = false;
        for (let i = 0; i < 16; i++) if (Math.abs(e[i] - m.e[i]) > 1e-5) { moved = true; break; }
        if (moved) { for (let i = 0; i < 16; i++) m.e[i] = e[i]; m.still = 0; } else m.still++;
        if (m.still >= 3) continue;
        // r2-perf: only movers within game.renderVelMaxDist (60 m) of the camera; farther ones are a few pixels and reproject
        // well enough from depth (clipped)
        const dx = e[12] - camera.position.x, dy = e[13] - camera.position.y, dz = e[14] - camera.position.z, R = game.renderVelMaxDist ?? (game.quality?.name === 'low' ? 30 : 60);
        if (dx * dx + dy * dy + dz * dz < R * R) velDraw.push(c);
      }
      return velDraw;
    }
    const clearC = new THREE.Color();
    function renderVelocity(r, w, h) {
      if (velRT.width !== w || velRT.height !== h) velRT.setSize(w, h);
      const now = performance.now();
      if (now - velListT > 500) { velListT = now; velRoots = listDynamic(); }
      velFrame++;
      const draw = movingRoots();
      if (!draw.length) return false;
      velMat.uniforms.uPrevVP.value.copy(prevVP);
      velMat.uniforms.uCurVP.value.copy(curVP);
      const sm = r.shadowMap, au = sm.autoUpdate, nu = sm.needsUpdate, ac = r.autoClear, ca = r.getClearAlpha();
      r.getClearColor(clearC);
      velScene.children = draw; // projection walks .children only; parents and world matrices stay untouched
      try {
        sm.autoUpdate = false; sm.needsUpdate = false;
        r.setClearColor(0x000000, 0); r.autoClear = true;
        r.setRenderTarget(velRT);
        r.render(velScene, camera);
      } finally {
        velScene.children = [];
        sm.autoUpdate = au; sm.needsUpdate = nu; r.autoClear = ac; r.setClearColor(clearC, ca);
      }
      return true;
    }
    let r3Was = false;
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), taaMat);
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    const prevVP = new THREE.Matrix4();
    const curVP = new THREE.Matrix4();
    let reset = true;
    let flip = 0;
    taa = {
      enabled: true,
      needsSwap: true,
      clear: false,
      renderToScreen: false,
      frame: 0,
      jx: 0,
      jy: 0,
      hist,
      invalidate() { reset = true; },
      setSize(w, h) {
        hist[0].setSize(w, h);
        hist[1].setSize(w, h);
        taaMat.uniforms.uTexel.value.set(1 / w, 1 / h);
        taaMat3.uniforms.uTexel.value.set(1 / w, 1 / h);
        sharpMat.uniforms.uTexel.value.set(1 / w, 1 / h);
        reset = true;
      },
      // called right before composer.render: jitter the projection (restored by unjitter after the frame)
      jitter(w, h) {
        taa.frame = (taa.frame + 1) % 8;
        const hal = (i, b) => {
          let f = 1;
          let r = 0;
          let k = i;
          while (k > 0) {
            f /= b;
            r += f * (k % b);
            k = Math.floor(k / b);
          }
          return r;
        };
        taa.jx = (hal(taa.frame + 1, 2) - 0.5) * 2 / w;
        taa.jy = (hal(taa.frame + 1, 3) - 0.5) * 2 / h;
        // r2-render: this frame's view (game code moved the camera after the last render; without this the reprojection
        // used the view of one frame earlier, so every camera move smeared the history by one frame of motion)
        if (game.renderR2 || game.renderVPFix) camera.updateMatrixWorld();
        curVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        const e = camera.projectionMatrix.elements;
        e[8] += taa.jx;
        e[9] += taa.jy;
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      },
      unjitter() {
        const e = camera.projectionMatrix.elements;
        e[8] -= taa.jx;
        e[9] -= taa.jy;
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        prevVP.copy(curVP);
      },
      render(r, writeBuffer, readBuffer) {
        const r3 = !!game.renderR2;
        if (r3 !== r3Was) { r3Was = r3; reset = true; } // the two resolves store different things in the history alpha
        if (r3) {
          try { return render3(r, writeBuffer, readBuffer); } catch (e) { console.warn('[post] renderR2 TAA failed, back to the old resolve', e); game.renderR2 = false; r3Was = false; reset = true; }
        }
        const U = taaMat.uniforms;
        const dst = hist[flip];
        const src = hist[1 - flip];
        U.tCur.value = readBuffer.texture;
        U.tHist.value = src.texture;
        U.tDepth.value = sceneDepth || target.depthTexture;
        // inverse of the jittered view-projection (matches the depth buffer exactly)
        U.uInvVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
        U.uPrevVP.value.copy(prevVP);
        U.uReset.value = reset ? 1 : 0;
        U.uR2.value = game.lookR2 !== false ? 1 : 0;
        reset = false;
        quad.material = taaMat;
        r.setRenderTarget(dst);
        r.render(quadScene, quadCam);
        copyMat.uniforms.tDiffuse.value = dst.texture;
        quad.material = copyMat;
        r.setRenderTarget(writeBuffer);
        r.render(quadScene, quadCam);
        flip = 1 - flip;
      },
    };
    function render3(r, writeBuffer, readBuffer) {
      const U = taaMat3.uniforms;
      const dst = hist[flip], src = hist[1 - flip];
      let velOn = false;
      if (game.renderVel !== false && !reset) {
        try { velOn = renderVelocity(r, readBuffer.width, readBuffer.height); } catch (e) { console.warn('[post] velocity pass off', e); game.renderVel = false; }
      }
      U.tCur.value = readBuffer.texture;
      U.tHist.value = src.texture;
      U.tDepth.value = sceneDepth || target.depthTexture;
      U.tVel.value = velRT.texture;
      U.uVelOn.value = velOn ? 1 : 0;
      // unjittered current view-projection: a still pixel fetches its history at its own texel center (no resampling
      // with the jitter offset every frame, which shimmered fine texture), and the jittered samples accumulate there
      U.uInvVP.value.copy(curVP).invert();
      U.uPrevVP.value.copy(prevVP);
      U.uNear.value = camera.near; U.uFar.value = camera.far;
      U.uBlendRest.value = game.renderTaaRest ?? 0.08;
      U.uDisocc.value = game.renderDisocc === true ? 1 : 0; // off: the depth test still misfired on textured ground at rest (ablation abl1: 3x the frame-to-frame noise); velocity + clipping handle ghosting
      U.uBoxMix.value = game.renderBoxMix ?? 0.2;
      U.uFilter.value = game.renderTaaFilter === false ? 0 : 1;
      // jitter in pixels: pixel c sampled the unjittered position c - j, so tap (i, j) sits at (i, j) - j from c's center... the
      // shader adds jo to the offset, so pass -j
      U.uJitPx.value.set(-taa.jx * readBuffer.width / 2, -taa.jy * readBuffer.height / 2);
      U.uCross.value = game.renderTaaCross ?? (game.quality?.name === 'medium' || game.quality?.name === 'low') ? 1 : 0; // r2-render: 0.5 let wind-moved leaves (no motion vectors) keep a smudged history (r2-veg: shrubs as blurry balls)
      U.uReset.value = reset ? 1 : 0;
      reset = false;
      quad.material = taaMat3;
      r.setRenderTarget(dst);
      r.render(quadScene, quadCam);
      const sh = game.renderSharp ?? 0; // r2-render: off by default (jag run: the sharpen doubled the frame-to-frame wobble and can re-step AA'd edges); 0.15 = subtle
      if (sh > 0) { sharpMat.uniforms.tDiffuse.value = dst.texture; sharpMat.uniforms.uSharp.value = sh; quad.material = sharpMat; }
      else { copy1Mat.uniforms.tDiffuse.value = dst.texture; quad.material = copy1Mat; } // one tap, alpha 1 (r2-perf: GPU cost)
      r.setRenderTarget(writeBuffer);
      r.render(quadScene, quadCam);
      flip = 1 - flip;
    }
    taa.velRT = velRT;
    composer.addPass(taa);
  } catch (e) {
    console.warn('[post] TAA unavailable', e);
    taa = null;
  }

  // ---------- look3: auto exposure (eye adaptation) ----------
  // A tiny center-weighted log-luminance image of the HDR frame (32x18, 8-bit with a 16-bit log encoding) is read back
  // asynchronously (no GPU stall) every few frames; the exposure follows it partially (game.lookAE: strength, limits),
  // so dusk streets and night blocks open up and bright sand / sky stop down, on top of the time-of-day exposure ramp.
  const lumRT = new THREE.WebGLRenderTarget(32, 18, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const lumMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; varying vec2 vUv;
      void main() {
        // 4 x 4 taps over this texel's 1/32 x 1/18 of the screen, luminance clamped (the sun disk must not rule it)
        float acc = 0.0;
        for ( int j = 0; j < 4; j++ ) for ( int i = 0; i < 4; i++ ) {
          vec2 o = ( vec2( float( i ), float( j ) ) - 1.5 ) / 4.0 * vec2( 1.0 / 32.0, 1.0 / 18.0 );
          float L = dot( texture2D( tDiffuse, vUv + o ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          acc += log2( clamp( L, 1.0 / 4096.0, 6.0 ) );
        }
        float e = clamp( ( acc / 16.0 + 12.0 ) / 16.0, 0.0, 1.0 ) * 65535.0; // log2 range -12..+4 in 16 bits
        float hi = floor( e / 256.0 );
        gl_FragColor = vec4( hi / 255.0, ( e - hi * 256.0 ) / 255.0, 0.0, 1.0 );
      }`,
    depthTest: false, depthWrite: false,
  });
  const lumQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lumMat); lumQuad.frustumCulled = false;
  const lumScene = new THREE.Scene(); lumScene.add(lumQuad);
  const lumCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const lumBuf = new Uint8Array(32 * 18 * 4);
  const lumW = new Float32Array(32 * 18);
  { let ws = 0; for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) { const dx = (x + 0.5) / 32 - 0.5, dy = (y + 0.5) / 18 - 0.45; const w = Math.exp(-(dx * dx * 5 + dy * dy * 7)); lumW[y * 32 + x] = w; ws += w; } for (let i = 0; i < lumW.length; i++) lumW[i] /= ws; }
  const ae = { pending: false, frame: 0, avgLog: null, comp: 0, ok: true };
  const aePass = {
    enabled: true, needsSwap: false, clear: false, renderToScreen: false,
    setSize() {},
    render(r, wb, rb) {
      if (!game.look3 || game.look3Parts?.ae === false || !ae.ok || ae.pending || (ae.frame++ % 24) !== 0) return; // r2-perf: every 24th frame (the readback synced the GPU queue under ANGLE-Metal; exposure eases at 0.9-1.8 per s, so 2-3 readings a second give the same result)
      lumMat.uniforms.tDiffuse.value = rb.texture;
      const prev = r.getRenderTarget();
      r.setRenderTarget(lumRT); r.render(lumScene, lumCam); r.setRenderTarget(prev);
      ae.pending = true;
      r.readRenderTargetPixelsAsync(lumRT, 0, 0, 32, 18, lumBuf).then(() => {
        let s = 0;
        for (let i = 0; i < lumW.length; i++) s += lumW[i] * (((lumBuf[i * 4] * 256 + lumBuf[i * 4 + 1]) / 65535) * 16 - 12);
        ae.avgLog = s;
        ae.pending = false;
      }).catch((e) => { ae.ok = false; ae.pending = false; console.warn('[post] auto exposure off', e); });
    },
  };
  composer.addPass(aePass);

  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.55, 0.92);
  composer.addPass(bloom);

  const output = new OutputPass();
  composer.addPass(output);

  const smaa = new SMAAPass(W * pr, H * pr);
  composer.addPass(smaa);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const gu = grade.uniforms;
  // r2-look: matched grade LUT (loaded once; until it arrives the grade runs without it)
  new THREE.TextureLoader().load('/assets/look/r2_grade_lut.png', (t) => {
    t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; gu.tLut.value = t;
  }, undefined, (e) => console.warn('[post] grade LUT', e));
  // ShaderPass clones uniforms: arrays -> use vectors for safety
  gu.uRes.value = new THREE.Vector2(W * pr, H * pr);
  for (const k of ['uLift', 'uGamma', 'uGain', 'uShadowTint', 'uHighTint', 'uSunColor']) gu[k].value = new THREE.Vector3().fromArray(gu[k].value);
  gu.uSunPos.value = new THREE.Vector2(0.5, 0.5);

  const sunWorld = new THREE.Vector3();
  const sunNdc = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  let speedSmooth = 0, adapt = 1, frameAvg = 1 / 60, aoAllowed = true, aoTimer = 0;
  let rsOver = 0;
  let rsUnder = 0;
  let rsBlock = 0;
  let rsSinceUp = 99;
  let time = 0;
  const lookB = { hemi: 0, sun: 0, env: 0 };
  const lookW = { hemi: -1, sun: -1, env: -1 };
  const lookCB = { sky: new THREE.Color(), gnd: new THREE.Color() };
  const lookCW = { sky: new THREE.Color(-1, -1, -1), gnd: new THREE.Color(-1, -1, -1) };

  // internal render scale (VFX_NOTES #4): only the composer targets shrink; the canvas stays at the quality DPR and
  // the last pass (grade) upscales to it. Driven by frame time with hysteresis (see governor).
  let renderScale = 1;
  // hard floor (user requirement): the internal picture never has fewer pixels than 1920x1080
  function scaleFloor() {
    if (game.dynres?.active) return game.dynres.floor ?? 0.5; // r2-perf dynamic resolution (src/render/dynres.v2.js, off by default): its own per-preset floor
    const full = Math.max(1, W * H) * renderer.getPixelRatio() * renderer.getPixelRatio();
    return Math.min(1, Math.sqrt((1920 * 1080) / full));
  }
  function setSize(w, h) {
    W = Math.max(1, w); H = Math.max(1, h);
    renderScale = Math.max(renderScale, scaleFloor());
    const p = renderer.getPixelRatio() * renderScale;
    composer.setPixelRatio(p);
    composer.setSize(W, H);
    gu.uRes.value.set(Math.floor(W * p), Math.floor(H * p));
    gu.uAspect.value = W / H;
    if (taa) taa.setSize(Math.floor(W * p), Math.floor(H * p));
  }
  setSize(W, H);

  // ---------- performance stats (the resolution is fixed and native; there is no adaptive scaler) ----------
  renderer.info.autoReset = false;
  game.lookU = LOOK_U; game.lookV = LOOK_V; // shared look3 shader uniforms (tools/v2/look debug views)
  const perf = game.perf = { fps: 60, frameMs: 16.7, cpuMs: 8, drawCalls: 0, triangles: 0, pixelRatio: renderer.getPixelRatio(), resScale: 1, gtao: false, ao: false };
  let lastNow = performance.now();
  let clock = 0;
  function applyPR(pr) {
    pr = Math.round(pr * 100) / 100;
    if (Math.abs(pr - renderer.getPixelRatio()) < 0.01) return false;
    renderer.setPixelRatio(pr);
    setSize(W, H);
    perf.pixelRatio = pr;
    perf.resScale = 1;
    return true;
  }
  function governor() {
    const now = performance.now();
    const ms = now - lastNow;
    lastNow = now;
    if (ms <= 0 || ms > 120) {
      return; // hidden tab / hitch: ignore
    }
    clock += ms / 1000;
    perf.frameMs += (ms - perf.frameMs) * 0.1;
    perf.fps = 1000 / perf.frameMs;
    // dynamic render scale from frame time only, with hysteresis: down after 2 s over 17.5 ms, up after 6 s near the
    // 60 fps cap. A raise that is followed by a drop within 10 s blocks raising for 60 s (no pumping at the cap).
    {
      const lk = LOOK_OFF ? null : game.quality?.current?.look;
      const rsMin = Math.max(lk?.scaleMin ?? 1, scaleFloor());
      const rsMax = Math.max(lk?.scaleMax ?? 1, rsMin);
      let want = Math.min(rsMax, Math.max(rsMin, renderScale));
      // r2-perf dynamic resolution: while active it owns the scale (target frame time per preset); try/catch -> old governor
      let dr = null;
      try { dr = game.dynres?.active ? game.dynres.pick(ms, perf) : null; } catch (e) { dr = null; }
      if (Number.isFinite(dr)) { want = dr; rsOver = rsUnder = 0; }
      rsBlock -= ms / 1000;
      rsSinceUp += ms / 1000;
      // CPU-bound frames (main-thread work fills the frame) gain nothing from fewer pixels: only a frame that waits
      // on the GPU counts as "over". cpuMs = time from this frame's rAF start to the end of the last render.
      const gpuBound = perf.frameMs > 17.5 && perf.cpuMs < perf.frameMs - 3;
      if (gpuBound) {
        rsOver += ms / 1000;
        rsUnder = 0;
      } else if (perf.frameMs < 17.0 || perf.frameMs > 17.5) {
        rsUnder += ms / 1000;
        rsOver = 0;
      } else {
        rsOver = 0;
        rsUnder = 0;
      }
      if (rsOver > 2 && want > rsMin) {
        want = Math.max(rsMin, Math.round((want - 0.05) * 100) / 100);
        rsOver = 0;
        if (rsSinceUp < 10) {
          rsBlock = 60;
        }
      } else if (rsUnder > 6 && want < rsMax && rsBlock <= 0) {
        want = Math.min(rsMax, Math.round((want + 0.05) * 100) / 100);
        rsUnder = 0;
        rsSinceUp = 0;
      }
      if (Math.abs(want - renderScale) > 0.001) {
        renderScale = want;
        setSize(W, H);
        perf.resScale = renderScale;
      }
    }
    // the display's pixel ratio can change (window dragged to another screen): follow it, never go below native
    const want = targetPR();
    if (Math.abs(want - renderer.getPixelRatio()) > 0.01) {
      applyPR(want);
    }
  }
  // keep the canvas exactly the size of the window: on resize, fullscreen and when the page finishes sizing
  function fitWindow() {
    // CSS size is always the whole window; only the drawing buffer is set from JavaScript
    renderer.domElement.style.width = '100vw';
    renderer.domElement.style.height = '100vh';
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const cur = new THREE.Vector2();
    renderer.getSize(cur);
    if (cur.x === w && cur.y === h && Math.abs(renderer.getPixelRatio() - targetPR()) < 0.01) {
      return;
    }
    renderer.setPixelRatio(targetPR());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    setSize(w, h);
  }
  window.addEventListener('resize', fitWindow);
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(fitWindow));
  fitWindow();
  try {
    const ro = new ResizeObserver(() => fitWindow());
    ro.observe(document.documentElement);
  } catch (e) {
    // ResizeObserver missing: the resize event still covers it
  }

  const aoSafe = !!(target.depthTexture && composer.renderTarget2.depthTexture && composer.renderTarget2.depthTexture !== target.depthTexture && composer.renderTarget2.depthTexture.source !== target.depthTexture.source);
  let failed = false;
  const api = {
    perf,
    setBasePixelRatio() { /* fixed native resolution: kept for callers, does nothing */ },
    fitWindow,
    composer, bloom, grade, gtao, smaa, ao, taa, ssr, shafts,
    get renderScale() { return renderScale; },
    // depth of this frame's scene pass (the MSAA target's depth when MSAA is on); other passes must read this
    get sceneDepth() { return sceneDepth; },
    get internalSize() { return [composer.renderTarget1.width, composer.renderTarget1.height]; },
    setSize,
    render(dt) {
      if (failed) { renderer.info.reset(); renderer.render(scene, camera); return; }
      try { renderImpl(dt); } catch (e) { failed = true; console.error('[post] render failed, falling back', e); renderer.render(scene, camera); }
    },
  };
  function renderImpl(dt) {
    {
      governor();
      renderer.info.reset();
      dt = dt || 0.016;
      time += dt;
      const env = game.env;
      const night = env?.nightFactor ?? 0;
      const day = env?.dayFactor ?? 1;

      // adaptive GTAO: only on 'high', and only while the frame rate can afford it (hysteresis)
      const ft = Math.min(dt, 0.1);
      frameAvg += (ft - frameAvg) * 0.05;
      if (gtao) {
        // GTAO re-renders the whole scene (G-buffer): only on 'ultra' at city scale
        const want = game.quality?.current?.gtao === true;
        // GTAO re-renders the whole scene (G-buffer): only when the preset asks for it (none do by default)
        aoAllowed = want;
        gtao.enabled = aoAllowed;
      }
      if (shafts) {
        // humid in-scatter: a trace at noon, more in the morning / golden hour, scaled down by cloud cover / overcast
        const env2 = game.env, sy = env2?.sunDir?.y ?? 1, skyU = env2?.sky?.material?.uniforms;
        const k = (game.lookShaftK ?? 1) * 0.0016 * (env2?.dayFactor ?? 0) * (0.35 + 0.65 * (1 - THREE.MathUtils.smoothstep(sy, 0.1, 0.6))) * (1 - (skyU?.uOvercast?.value ?? 0)) * (1 - (env2?.indoor || 0));
        shafts.uniforms.uK.value = k;
        shafts.enabled = !!(game.look3 && game.lookR2 !== false && game.lookShafts !== false && (game.lookShafts === true || sy < 0.35) && k > 1e-6 && !env2?.underwater && env2?.sunNear?.shadow?.map && env2?.sun?.shadow?.map && env2.sunNear.castShadow);
      }
      if (ssr) ssr.enabled = WEATHER_U[0] > 0.02 && !env?.underwater && (env?.indoor ?? 0) < 0.5 && game.settings?.quality !== 'low';
      if (ao) { ao.enabled = !gtao?.enabled && game.settings?.ao !== false && aoSafe && game.settings?.quality !== 'low' && !env?.underwater; perf.ao = ao.enabled; }

      // ---------- look track: sun-to-shade ratio ----------
      // environment.js re-sets these every frame from its time-of-day ramps; this rescales them right before the render.
      // By day the flat sky fill (hemisphere + PMREM diffuse) is cut and the sun pushed, so shade reads as shade.
      // ?lookoff restores the old balance. Tunables live on game.look.
      if (!LOOK_OFF && env && !env.underwater) {
        const L0 = game.look || (game.look = { hemiDay: 1.65, envDay: 0.6, sunDay: 1.14, skyDesat: 0.75, bounce: 0.6, neutral: 1, shadeTint: 0.25 });
        // look3: a real sun-to-shade ratio (about 5:1 on flat ground at noon, as in the mock-ups): less flat sky fill,
        // a stronger sun, shade keeps a little of the sky's blue instead of going gray
        const L = game.look3 ? (game.look3L || (game.look3L = { ...L0, hemiDay: 0.95, envDay: 0.42, sunDay: 1.22, skyDesat: 0.5, bounce: 0.75, shadeTint: 0.35 })) : L0;
        // r2-look / r2-art: open shade read navy; the sky fill is pulled further toward neutral in round 2
        const skyDesat = game.look3 && game.lookR2 !== false ? (game.lookSkyDesat ?? 0.5) : L.skyDesat;
        // r2-look (lead / outside critique at the mock-up camera: "brighter and harsher, less natural shading"): softer sun,
        // more sky fill. Round 2 keeps the shade deep through the cast-shadow terms (shadows.js), not through a weak sky.
        const LR = game.look3 && game.lookR2 !== false ? (game.lookR2L || (game.lookR2L = { hemiDay: 1.2, envDay: 0.5, sunDay: 1.22 })) : L;
        // full effect only with the sun well up: at golden hour backlit foliage needs its sky fill (black trees otherwise)
        const sunUp = THREE.MathUtils.smoothstep(env.sunDir?.y ?? 1, 0.12, 0.4);
        const dl = day * sunUp * (1 - (env.indoor || 0));
        // rescale only values environment.js wrote this frame (if it skipped a frame, e.g. paused, nothing compounds)
        if (env.hemi) {
          if (env.hemi.intensity !== lookW.hemi) lookB.hemi = env.hemi.intensity;
          env.hemi.intensity = lookW.hemi = lookB.hemi * (1 + (LR.hemiDay - 1) * dl);
        }
        if (env.sun) {
          if (env.sun.intensity !== lookW.sun) lookB.sun = env.sun.intensity;
          env.sun.intensity = lookW.sun = lookB.sun * (1 + (LR.sunDay - 1) * dl);
        }
        if ('environmentIntensity' in scene) {
          if (scene.environmentIntensity !== lookW.env) lookB.env = scene.environmentIntensity;
          // at night the sky env map is mostly a blurred moon: it put round hotspots in glass and lifted the street,
          // so it drops to 35% (night should be dark, lit by lamps and windows)
          scene.environmentIntensity = lookW.env = lookB.env * (1 + (LR.envDay - 1) * dl) * (1 - 0.65 * night * (L.nightEnv ?? 1));
        }
        // neutral shade (navy-concrete fix): shaded faces were lit only by a saturated blue sky. By day the hemisphere
        // sky colour is pulled toward its own gray and the ground colour gets a warm sun bounce (sun x dry ground
        // albedo), so shade reads neutral gray while the sunlit side is unchanged. Colours are re-captured whenever
        // environment.js wrote new ones, so nothing compounds.
        if (env.hemi && L.neutral) {
          const dn = day * (1 - (env.indoor || 0)) * THREE.MathUtils.smoothstep(env.sunDir?.y ?? 1, 0.05, 0.25);
          const hc = env.hemi.color;
          const hg = env.hemi.groundColor;
          if (!hc.equals(lookCW.sky)) lookCB.sky.copy(hc);
          if (!hg.equals(lookCW.gnd)) lookCB.gnd.copy(hg);
          const lum = lookCB.sky.r * 0.2126 + lookCB.sky.g * 0.7152 + lookCB.sky.b * 0.0722;
          const k = skyDesat * dn;
          hc.setRGB(lookCB.sky.r + (lum * 1.02 - lookCB.sky.r) * k, lookCB.sky.g + (lum * 1.0 - lookCB.sky.g) * k, lookCB.sky.b + (lum * 1.04 - lookCB.sky.b) * k);
          const sc = env.sun ? env.sun.color : hc;
          const b = L.bounce * dn;
          hg.setRGB(lookCB.gnd.r + sc.r * 0.36 * b, lookCB.gnd.g + sc.g * 0.31 * b, lookCB.gnd.b + sc.b * 0.24 * b);
          lookCW.sky.copy(hc);
          lookCW.gnd.copy(hg);
        }
      }
      const golden0 = day * (1 - THREE.MathUtils.smoothstep(env?.sunDir?.y ?? 0.3, 0.05, 0.3));
      // bloom: highlights only by day, a little more at sunset (sun glow), generous at night (neon)
      // interiors (club, bars) glow like night by day too: the bloom night term follows max(night, indoor)
      const bloomNight = Math.max(night, env?.indoor || 0);
      bloom.strength = 0.20 + 0.13 * bloomNight + 0.14 * golden0;
      bloom.radius = 0.45 + 0.1 * bloomNight;
      bloom.threshold = 1.0 - 0.25 * bloomNight - 0.14 * golden0; // sunset: the glitter path and sun rim bloom a little

      // speed streaks
      const st = game.player?.state;
      const kmh = st?.inVehicle && st.vehicle ? (st.vehicle.speedKmh || 0) : 0;
      const target = THREE.MathUtils.clamp((Math.abs(kmh) - 110) / 140, 0, 1); // speed blur only when really flying (110+ km/h)
      speedSmooth += (target - speedSmooth) * Math.min(1, dt * 3);
      gu.uSpeed.value = speedSmooth;

      // sun glare
      let sunOn = 0;
      if (env?.sunDir && day > 0.01) {
        camera.getWorldDirection(camDir);
        sunWorld.copy(camera.position).addScaledVector(env.sunDir, 1000);
        if (camDir.dot(env.sunDir) > 0) {
          sunNdc.copy(sunWorld).project(camera);
          const edge = Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y));
          if (edge < 1.6) {
            gu.uSunPos.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
            sunOn = day * THREE.MathUtils.clamp((1.6 - edge) / 0.6, 0, 1);
            const c = env.sun.color;
            gu.uSunColor.value.set(c.r, c.g * 0.92, c.b * 0.8);
          }
        }
      }
      sunOn *= 1 - (env?.indoor || 0);
      gu.uSunOn.value = sunOn;
      gu.uStable.value = game.look3 ? 1 : 0;
      // simple eye adaptation: stop down when staring into the sun, open up slightly otherwise
      const adaptTarget = 1.0 - 0.3 * sunOn * day;
      adapt += (adaptTarget - adapt) * Math.min(1, dt * 1.5);
      // look3 auto exposure: partial adaptation toward a reference scene luminance, limited to -0.6 / +1.1 stops
      {
        const A = game.lookAE || (game.lookAE = { ref: -2.0, strength: 0.55, min: -0.3, max: 1.1, up: 0.9, down: 1.8 });
        let want = 0;
        if (game.look3 && ae.avgLog !== null && !env?.underwater) { const r2a = game.lookR2 !== false; want = THREE.MathUtils.clamp((A.ref - ae.avgLog) * A.strength, r2a ? Math.max(A.min, -0.1) : A.min, A.max * (1 - 0.45 * night) * (1 - (r2a ? 0.5 : 0.65) * THREE.MathUtils.smoothstep(env?.sunDir?.y ?? 0, 0.15, 0.45))); } // nights stay night; at high sun shaded streets open at most ~0.4 stop (downtown noon washed out at +0.9)
        const rate = want > ae.comp ? A.up : A.down;
        ae.comp += (want - ae.comp) * (1 - Math.exp(-Math.min(dt, 0.1) * rate));
        if (game.lookAEInstant) ae.comp = want;
        A.avgLog = ae.avgLog; A.comp = ae.comp;
      }
      if (env?.exposure) renderer.toneMappingExposure = env.exposure * adapt * Math.pow(2, ae.comp) * (game.look3 && game.lookR2 !== false ? (game.lookExpR2 ?? 1.12) : 1); // r2-look (user, Nov 17 afternoon: "too dark"): +0.16 stop; sunlit pale ground ~0.8 display
      // god rays: only when the sun is on/near screen; stronger when low (golden hour)
      const low = 1 - THREE.MathUtils.smoothstep(env?.sunDir?.y ?? 1, 0.1, 0.5);
      gu.uRays.value = sunOn > 0 ? Math.min(1, sunOn * 1.5) * (LOOK_OFF ? 0.3 + 0.25 * low : 0.12 + 0.13 * low) : 0; // look track: shafts halved (user: glare too strong and hazy)

      // grade: warmer, punchier at golden hour; cooler & bluer at night
      const golden = day * (1 - THREE.MathUtils.smoothstep(env?.sunDir?.y ?? 0.3, 0.05, 0.35));
      if (LOOK_OFF) {
        gu.uHighTint.value.set(0.025 + 0.03 * golden - 0.02 * night, 0.010 - 0.004 * golden - 0.005 * night, -0.02 + 0.012 * golden + 0.02 * night);
        gu.uShadowTint.value.set(-0.012 + 0.012 * golden - 0.005 * night, 0.010 - 0.006 * golden, 0.028 + 0.010 * golden + 0.02 * night);
        gu.uSat.value = 1.25 * (1 - 0.92 * (game.deathFade || 0));
        gu.uToe.value = 0;
      } else {
        // look track: restrained, near-neutral day grade (ref_51): light warm highlights, faint teal shadows, a slightly firmer toe; violet shadows at sunset
        const dayOnly = day * (1 - golden);
        gu.uHighTint.value.set(0.028 + 0.035 * golden - 0.02 * night, 0.012 - 0.006 * golden - 0.006 * night, -0.022 + 0.014 * golden + 0.025 * night);
        gu.uShadowTint.value.set(-0.012 + 0.012 * golden - 0.005 * night, 0.010 - 0.006 * golden, 0.020 + 0.016 * golden + 0.02 * night);
        // shade tint strength by day (game.look.shadeTint): the teal shadow push read as navy on concrete in shade
        gu.uShadowTint.value.multiplyScalar(1 - (1 - (game.look?.shadeTint ?? 0.25)) * (1 - golden) * day);
        // sunset cast: the pink-violet sunset lighting tinted everything; cut it by about 30% with a white-balance shift
        // toward green and less golden-hour saturation (game.look.sunsetFix: 1 = on, 0 = old look)
        // twilight weight (the pink cast lives where dayFactor is already small, so golden alone missed it)
        const twi = (1 - night) * (1 - THREE.MathUtils.smoothstep(env?.sunDir?.y ?? 1, 0.05, 0.35));
        const gc = twi * (game.look?.sunsetFix ?? 1) * (1 - 0.5 * Math.max(game.weather?.fog ?? 0, (game.weather?.cloud ?? 0) > 0.85 ? 0.7 : 0)); // stage 1: no green cast in fog / under overcast
        gu.uGain.value.set(1.03 - 0.03 * gc, 1.0 + 0.09 * gc, 0.96 - 0.02 * gc);
        gu.uSat.value = (1.1 + 0.1 * golden - 0.16 * gc) * (1 - 0.92 * (game.deathFade || 0));
        gu.uToe.value = 0.012 * dayOnly + 0.008 * golden;
        gu.uContrast.value = 0.37 + 0.08 * dayOnly;
        gu.uSharp.value = game.quality?.current?.look?.sharpen ?? 0.6;
        if (game.look3) {
          // look3 grade: the contrast now comes from the light (sun vs shade), so the display S-curve and saturation
          // relax (sat 1.1 -> 0.97 by day: neon reds and orange sand), a soft warm-humid highlight roll and a firmer toe
          const G = game.look3G || (game.look3G = { sat: 0.93, satGold: 1.02, contrast: 0.3, toe: 0.012 });
          gu.uSat.value = (G.sat + (G.satGold - G.sat) * golden - 0.05 * gc) * (1 - 0.92 * (game.deathFade || 0));
          // the old green white-balance shift countered a pink sky; the look3 sky is gold, so only a trace of it stays
          // r2-look: by day the white balance stays near neutral (1.03 / 0.96 turned sand and white paint cream-yellow); golden hour keeps its warmth
          const r2d = game.lookR2 !== false ? dayOnly : 0; // r2-look in-session A/B: game.lookR2 = false
          gu.uGain.value.set(1.03 - 0.015 * r2d - 0.012 * gc, 1.0 + 0.03 * gc, 0.96 + 0.02 * r2d - 0.008 * gc);
          gu.uContrast.value = G.contrast + 0.06 * dayOnly;
          gu.uShadowTint.value.y *= 1 - 0.8 * r2d; // r2-look / r2-art: shade neutral-to-slightly-cool by day, not teal
          gu.uToe.value = G.toe * (0.6 + 0.4 * day); // (r2-look: the lifted toe read as a gray cast at the deck; back to the overnight toe)
          gu.uHighTint.value.set(0.024 - 0.005 * r2d + 0.03 * golden - 0.02 * night, 0.013 - 0.005 * r2d - 0.006 * golden - 0.006 * night, -0.012 + 0.008 * r2d + 0.012 * golden + 0.025 * night); // r2-look: softer warm highlight push by day
        }
      }
      gu.uChromaKnee.value = !LOOK_OFF && game.look3 && game.lookR2 !== false ? (game.lookChromaKnee ?? 1) : 0; // r2-look: photographic roll-off of the most saturated greens / magentas
      gu.uLutMix.value = !LOOK_OFF && game.look3 && game.lookR2 !== false && gu.tLut.value ? (game.lookLut ?? 1) * (0.35 + 0.65 * day) * (1 - 0.92 * (game.deathFade || 0)) : 0; // r2-look matched grade (built from a day frame: weaker at night) (A/B: game.lookLut = 0)
      if (gu._vigBase === undefined) gu._vigBase = LOOK_OFF ? gu.uVignette.value : 0.27;
      gu.uVignette.value = gu._vigBase + Math.max(0, 0.35 + 0.55 * (game.deathFade || 0) - gu._vigBase) * Math.min(1, (game.deathFade || 0) * 4);
      // look track: cap HDR before bloom (believable sparkle, not a glare disc on wet sand or water at low sun)
      sanitize.uniforms.uMax.value = LOOK_OFF ? 48.0 : 10.0;
      gu.uTime.value = time;
      gu.uUnder.value = env?.underwater || 0;
      if (env?.underwater) { gu.uSunOn.value = 0; gu.uRays.value = 0; }

      // TAA mode per preset: 'always', 'auto' (only while the render scale is below 1, where it reconstructs the missing
      // pixels; at full scale SMAA is sharper on moving foliage because there are no motion vectors), or false
      // z-fighting (gameplay cameras only; cinema.js sets its own from the focus distance): high cameras (aircraft,
      // rooftops) get a larger near plane, since depth precision at range scales with it. Street level keeps 0.25.
      if (!game.cameraOverride && !LOOK_OFF) {
        let gy = 0;
        try {
          gy = game.city?.groundHeightAt?.(camera.position.x, camera.position.z) ?? 0;
        } catch (e) {
          gy = 0;
        }
        const wantNear = Math.min(1.2, Math.max(0.25, (camera.position.y - gy) * 0.012));
        if (Math.abs(camera.near - wantNear) > 0.03) {
          camera.near = wantNear;
          camera.updateProjectionMatrix();
        }
      }
      const taaMode = game.quality?.current?.look?.taa;
      const taaOn = !!taa && !LOOK_OFF && !env?.underwater && (taaMode === 'always' || (taaMode === 'auto' && renderScale < 0.999));
      if (taa) {
        if (taaOn && !taa.enabled) taa.invalidate();
        taa.enabled = taaOn;
      }
      smaa.enabled = !taaOn;
      if (taaOn) {
        if (!LOOK_OFF) gu.uSharp.value = Math.max(gu.uSharp.value, game.quality?.current?.look?.taaSharpen ?? 0.8);
        if (game.renderR2) gu.uSharp.value = game.renderGradeSharp ?? 0.22;   // user: things looked blurred / over-smoothed: a firmer (still halo-free) final sharpen // r2-render: the TAA output already sharpens (clamped, in HDR)
        taa.jitter(Math.floor(W * renderer.getPixelRatio() * renderScale), Math.floor(H * renderer.getPixelRatio() * renderScale));
      }
      {
        const TM = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };
        // look3: Khronos PBR Neutral (hue- and saturation-true, deep skies; ACES pushed reds to neon and skies to cyan)
        const want = TM[game.look3 ? (game.lookTM || 'neutral') : 'aces'] ?? THREE.ACESFilmicToneMapping;
        if (renderer.toneMapping !== want) renderer.toneMapping = want;
      }
      advanceFrameNoise();
      RENDER_R2.value = game.renderR2 && taaOn && game.renderDither !== false ? 1 : 0; // r2-render: golden-ratio stepped dithers (only where TAA resolves them)
      { // r2-render: camera focus for the foliage proximity fade (third-person only: no fade in cutscenes / free cameras)
        const P = game.player?.position, F = CAM_FOCUS.value;
        if (P && !game.cameraOverride && game.renderNearFade !== false) { F[0] = P.x; F[1] = P.y + 1.2; F[2] = P.z; } else F[1] = -1e5;
      }
      // look pass 3 (game.look3, runtime A/B): soft shadows + per-frame noise index for the shadow / AO kernels
      if (game.look3 === undefined) game.look3 = LOOK3_DEFAULT && !LOOK_OFF;
      LOOK_U[0] = FRAME_NOISE.value;
      const L3P = game.look3Parts || (game.look3Parts = { pcss: true, ao: true, ae: true }); // per-part switches (perf A/B)
      LOOK_U[1] = game.look3 && L3P.pcss ? (game.lookR2 !== false ? 2 : 1) : 0; // r2-look in-session A/B: game.lookR2 = false
      if (LOOK_U[1] === 2 && game.renderR2 && game.renderShadowBil !== false) LOOK_U[1] = 3; // r2-render: bilinear narrow-penumbra filter (look3.js)
      // r2-look shaded ambient (shadows.js): share of sky / bounce light lost in a cast shadow, by day, outdoors (game.lookShadeAmb)
      LOOK_W[0] = game.look3 && game.lookR2 !== false ? (game.lookShadeAmb ?? 0.25) * (game.env?.dayFactor ?? 1) * (1 - (game.env?.indoor || 0)) : 0;
      {
        // bounce into cast shadows: sun irradiance on the ground x surrounding albedo (~0.2) x the share of the view it fills
        const e = game.env, on = game.look3 && game.lookR2 !== false && e?.sun && e.sunDir;
        const k = on ? (game.lookShadeBounce ?? 0.17) * e.sun.intensity * Math.max(0, e.sunDir.y) * (e.dayFactor ?? 1) * (1 - (e.indoor || 0)) : 0;
        const c = e?.sun?.color;
        LOOK_W[1] = c ? c.r * k : 0; LOOK_W[2] = c ? c.g * k * 0.98 : 0; LOOK_W[3] = c ? c.b * k * 0.93 : 0; // a touch warm (sand, stucco)
      }
      {
        // aerial perspective (clear weather): humid Florida air, a touch more by day than the old cap, thick at golden hour
        const sy = game.env?.sunDir?.y ?? 0.5;
        const gold = (game.env?.dayFactor ?? 1) * (1 - THREE.MathUtils.smoothstep(sy, 0.04, 0.3));
        const H = game.lookHaze || (game.lookHaze = { day: 0.00026, golden: 0.00046, night: 0.00021 });
        const hz = game.lookR2 !== false ? (game.lookHazeR2 ?? 1.3) : 1; // r2-look: humid, slightly hazy distance (mock-up)
        LOOK_V[0] = game.look3 ? THREE.MathUtils.lerp(THREE.MathUtils.lerp(H.night, H.day * hz, game.env?.dayFactor ?? 1), H.golden, gold) : 0;
      }
      try {
        composer.render(dt);
      } finally {
        if (taaOn) taa.unjitter();
      }
      {
        const tl = document.timeline?.currentTime;
        if (typeof tl === 'number') {
          const c = performance.now() - tl;
          if (c >= 0 && c < 200) perf.cpuMs += (c - perf.cpuMs) * 0.1;
        }
      }
      perf.drawCalls = renderer.info.render.calls;
      perf.triangles = renderer.info.render.triangles;
      perf.gtao = !!gtao?.enabled;
    }
  }
  return api;
}

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GradeShader } from './gradeShader.js';
import { advanceFrameNoise, FRAME_NOISE } from './frameNoise.js';
import { WEATHER_U } from './wetSurfaces.js';
import { LOOK_OFF } from '../world/env/fogChunks.js';

// Pipeline (HDR linear until OutputPass, display-referred after):
// Render -> [GTAO half-res, ultra only] -> contact AO (depth only, one pass) -> UnrealBloom -> Output (ACES + sRGB) -> SMAA -> Grade (to screen)
export function createPost(game) {
  const { renderer, scene, camera } = game;
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

  // ---------- contact AO: single full-res pass from the depth buffer (normals rebuilt from depth) ----------
  // Darkens creases and the ground under objects within ~1 m. 10 taps, no blur, no second scene render.
  // Off with game.settings.ao === false or quality 'low'; replaced by GTAO on 'ultra'.
  let ao = null;
  try {
    if (!target.depthTexture) throw new Error('depth texture unavailable');
    ao = new ShaderPass({
      name: 'PortSolanaContactAO',
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProjY: { value: 1 }, uAspect: { value: 1 }, uRes: { value: new THREE.Vector2(W * pr, H * pr) }, uRadius: { value: 1.0 }, uIntensity: { value: 1.5 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform mat4 uProjInv; uniform float uProjY, uAspect, uRadius, uIntensity; uniform vec2 uRes;
        varying vec2 vUv;
        vec3 viewPos( vec2 uv ) { float d = texture2D( tDepth, uv ).x; vec4 v = uProjInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); return v.xyz / v.w; }
        void main() {
          vec4 c = texture2D( tDiffuse, vUv );
          float d = texture2D( tDepth, vUv ).x;
          if ( d >= 0.99995 ) { gl_FragColor = c; return; }
          vec3 P = viewPos( vUv );
          float fade = 1.0 - smoothstep( 55.0, 130.0, -P.z );
          if ( fade <= 0.0 ) { gl_FragColor = c; return; }
          vec2 px = 1.0 / uRes;
          vec3 dx1 = viewPos( vUv + vec2( px.x, 0.0 ) ) - P, dx2 = P - viewPos( vUv - vec2( px.x, 0.0 ) );
          vec3 dy1 = viewPos( vUv + vec2( 0.0, px.y ) ) - P, dy2 = P - viewPos( vUv - vec2( 0.0, px.y ) );
          vec3 Nc = cross( abs( dx1.z ) < abs( dx2.z ) ? dx1 : dx2, abs( dy1.z ) < abs( dy2.z ) ? dy1 : dy2 );
          float nl = dot( Nc, Nc );
          if ( !( nl > 1e-16 ) ) { gl_FragColor = c; return; }
          vec3 N = Nc * inversesqrt( nl );
          float rad = clamp( uRadius * uProjY * 0.5 / max( -P.z, 0.3 ), 3.0 * px.y, 0.09 );
          float worldR = rad * 2.0 * max( -P.z, 0.3 ) / uProjY; // radius actually covered after clamping
          float n = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) * 6.2831853;
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
          if ( !( aoV == aoV ) ) aoV = 1.0;
          float l = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          aoV = mix( aoV, 1.0, 0.5 * smoothstep( 0.8, 3.0, l ) ); // emissives and hot highlights keep their energy
          c.rgb *= mix( 1.0, aoV, fade );
          gl_FragColor = c;
        }`,
    });
    ao.material.depthTest = false; ao.material.depthWrite = false;
    const aoRender = ao.render.bind(ao);
    ao.render = (r, wb, rb, dt, mask) => {
      const U = ao.uniforms;
      U.tDepth.value = sceneDepth || rb.depthTexture;
      U.uProjInv.value.copy(camera.projectionMatrixInverse);
      U.uProjY.value = camera.projectionMatrix.elements[5];
      U.uAspect.value = W / H;
      U.uRes.value.set(rb.width, rb.height);
      aoRender(r, wb, rb, dt, mask);
    };
    composer.addPass(ao);
  } catch (e) { console.warn('[post] contact AO unavailable', e); ao = null; }

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
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2(1, 1) }, uWeather: { value: WEATHER_U }, uFrameN: FRAME_NOISE },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform mat4 uProj, uProjInv, uViewInv; uniform vec2 uRes; uniform vec4 uWeather; uniform float uFrameN;
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
          float amt = up * ( 0.22 * uWeather.x * ( 1.0 - 0.85 * leafy ) + 0.7 * puddle );
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
          // 4-tap cross neighborhood (cheap; the corners add little once the variance box is used)
          for ( int i = 0; i < 4; i++ ) {
            vec2 o = i == 0 ? vec2( 1.0, 0.0 ) : i == 1 ? vec2( -1.0, 0.0 ) : i == 2 ? vec2( 0.0, 1.0 ) : vec2( 0.0, -1.0 );
            vec3 y = toY( tm( texture2D( tCur, vUv + o * uTexel ).rgb ) );
            mn = min( mn, y );
            mx = max( mx, y );
            m1 += y;
            m2 += y * y;
          }
          // variance box (tighter than min/max: less ghosting), kept inside min/max
          vec3 mu = m1 / 5.0;
          vec3 sd = sqrt( max( m2 / 5.0 - mu * mu, 0.0 ) );
          mn = max( mn, mu - 1.0 * sd );
          mx = min( mx, mu + 1.0 * sd );
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
          a = mix( a, 0.5, clamp( length( ( puv - vUv ) / uTexel ) / 40.0, 0.0, 1.0 ) * step( eB, eA ) );
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
    composer.addPass(taa);
  } catch (e) {
    console.warn('[post] TAA unavailable', e);
    taa = null;
  }

  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.55, 0.92);
  composer.addPass(bloom);

  const output = new OutputPass();
  composer.addPass(output);

  const smaa = new SMAAPass(W * pr, H * pr);
  composer.addPass(smaa);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const gu = grade.uniforms;
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
    composer, bloom, grade, gtao, smaa, ao, taa, ssr,
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
      if (ssr) ssr.enabled = WEATHER_U[0] > 0.02 && !env?.underwater && (env?.indoor ?? 0) < 0.5 && game.settings?.quality !== 'low';
      if (ao) { ao.enabled = !gtao?.enabled && game.settings?.ao !== false && aoSafe && game.settings?.quality !== 'low' && !env?.underwater; perf.ao = ao.enabled; }

      // ---------- look track: sun-to-shade ratio ----------
      // environment.js re-sets these every frame from its time-of-day ramps; this rescales them right before the render.
      // By day the flat sky fill (hemisphere + PMREM diffuse) is cut and the sun pushed, so shade reads as shade.
      // ?lookoff restores the old balance. Tunables live on game.look.
      if (!LOOK_OFF && env && !env.underwater) {
        const L = game.look || (game.look = { hemiDay: 1.65, envDay: 0.6, sunDay: 1.14, skyDesat: 0.75, bounce: 0.6, neutral: 1, shadeTint: 0.25 });
        // full effect only with the sun well up: at golden hour backlit foliage needs its sky fill (black trees otherwise)
        const sunUp = THREE.MathUtils.smoothstep(env.sunDir?.y ?? 1, 0.12, 0.4);
        const dl = day * sunUp * (1 - (env.indoor || 0));
        // rescale only values environment.js wrote this frame (if it skipped a frame, e.g. paused, nothing compounds)
        if (env.hemi) {
          if (env.hemi.intensity !== lookW.hemi) lookB.hemi = env.hemi.intensity;
          env.hemi.intensity = lookW.hemi = lookB.hemi * (1 + (L.hemiDay - 1) * dl);
        }
        if (env.sun) {
          if (env.sun.intensity !== lookW.sun) lookB.sun = env.sun.intensity;
          env.sun.intensity = lookW.sun = lookB.sun * (1 + (L.sunDay - 1) * dl);
        }
        if ('environmentIntensity' in scene) {
          if (scene.environmentIntensity !== lookW.env) lookB.env = scene.environmentIntensity;
          // at night the sky env map is mostly a blurred moon: it put round hotspots in glass and lifted the street,
          // so it drops to 35% (night should be dark, lit by lamps and windows)
          scene.environmentIntensity = lookW.env = lookB.env * (1 + (L.envDay - 1) * dl) * (1 - 0.65 * night * (L.nightEnv ?? 1));
        }
        // neutral shade (navy-concrete fix): shaded faces were lit only by a saturated blue sky. By day the hemisphere
        // sky colour is pulled toward its own grey and the ground colour gets a warm sun bounce (sun x dry ground
        // albedo), so shade reads neutral grey while the sunlit side is unchanged. Colours are re-captured whenever
        // environment.js wrote new ones, so nothing compounds.
        if (env.hemi && L.neutral) {
          const dn = day * (1 - (env.indoor || 0)) * THREE.MathUtils.smoothstep(env.sunDir?.y ?? 1, 0.05, 0.25);
          const hc = env.hemi.color;
          const hg = env.hemi.groundColor;
          if (!hc.equals(lookCW.sky)) lookCB.sky.copy(hc);
          if (!hg.equals(lookCW.gnd)) lookCB.gnd.copy(hg);
          const lum = lookCB.sky.r * 0.2126 + lookCB.sky.g * 0.7152 + lookCB.sky.b * 0.0722;
          const k = L.skyDesat * dn;
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
      // simple eye adaptation: stop down when staring into the sun, open up slightly otherwise
      const adaptTarget = 1.0 - 0.3 * sunOn * day;
      adapt += (adaptTarget - adapt) * Math.min(1, dt * 1.5);
      if (env?.exposure) renderer.toneMappingExposure = env.exposure * adapt;
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
      }
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
        taa.jitter(Math.floor(W * renderer.getPixelRatio() * renderScale), Math.floor(H * renderer.getPixelRatio() * renderScale));
      }
      advanceFrameNoise();
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

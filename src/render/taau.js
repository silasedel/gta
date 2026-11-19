// r2-perf DRAFT for r2-render (not wired, not auto-loaded): an output-resolution temporal upscaler (TAAU) built on the
// renderR2 resolve in post.js (same YCoCg variance clip, velocity texture, depth-in-history-alpha disocclusion test).
// Why: with the dynamic resolution (src/render/dynres.v2.js) the scene renders at 60-100 % of the output size. The
// current TAA keeps its history at the INPUT size and the grade pass upscales bilinearly, so a 0.8 scale looks 0.8 soft.
// A TAAU keeps the history at the OUTPUT size and lands each jittered input sample where it really was, so over 8 frames
// of Halton jitter the output converges to (close to) native detail at rest, and to the input detail in motion.
// Contract (r2-render's constraints, Nov 17):
//   - history alpha = linear view depth (the disocclusion test reads it); the copy to the composer forces alpha 1
//   - tVel (taa.velRT) is at the INPUT size: rg = uv motion cur(jittered) - prev(unjittered), b = view depth, a = prev depth
//   - uPrevVP = unjittered previous view-projection; uJitter = this frame's jitter in input pixels (taa.jx * W / 2 ...)
// Integration (needs the composer split, see docs/v2/reports/PERF_PLAN.md item 13): passes before TAA run at the input
// size (scene, AO, SSR, shafts, AE); this pass reads the input-size HDR + depth and writes an OUTPUT-size target; bloom,
// output, SMAA (off under TAA) and grade then run at the output size.
//   const taau = createTaau(THREE); taau.setSize(inW, inH, outW, outH); taau.render(renderer, { cur, depth, vel, velOn,
//     invVP, prevVP, jitterPx: [jx, jy], near, far, reset }, outTarget)
export function createTaau(THREE) {
  const mat = new THREE.ShaderMaterial({
    name: 'SouthlineTAAU',
    uniforms: {
      tCur: { value: null },
      tHist: { value: null },
      tDepth: { value: null },
      tVel: { value: null },
      uInvVP: { value: new THREE.Matrix4() },
      uPrevVP: { value: new THREE.Matrix4() },
      uInTexel: { value: new THREE.Vector2(1, 1) },
      uOutTexel: { value: new THREE.Vector2(1, 1) },
      uInSize: { value: new THREE.Vector2(1, 1) },
      uJitter: { value: new THREE.Vector2(0, 0) },
      uReset: { value: 1 },
      uVelOn: { value: 0 },
      uNear: { value: 0.25 },
      uFar: { value: 3000 },
      uBlendRest: { value: 0.08 },
    },
    vertexShader:
      'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform sampler2D tCur; uniform sampler2D tHist; uniform sampler2D tDepth; uniform sampler2D tVel;
      uniform mat4 uInvVP; uniform mat4 uPrevVP; uniform vec2 uInTexel, uOutTexel, uInSize, uJitter;
      uniform float uReset, uVelOn, uNear, uFar, uBlendRest;
      varying vec2 vUv;
      vec3 toY( vec3 c ) { return vec3( 0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b ); }
      vec3 fromY( vec3 y ) { return vec3( y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z ); }
      vec3 tm( vec3 c ) { return c / ( 1.0 + max( c.r, max( c.g, c.b ) ) ); }
      vec3 itm( vec3 c ) { return c / max( 1.0 - max( c.r, max( c.g, c.b ) ), 1e-3 ); }
      float linZd( float d ) { return d >= 0.99995 ? 6.0e4 : -perspectiveDepthToViewZ( d, uNear, uFar ); }
      vec3 histCR( vec2 uv ) { // Catmull-Rom, 5 taps, at the OUTPUT size
        vec2 tsz = 1.0 / uOutTexel, sp = uv * tsz, tp = floor( sp - 0.5 ) + 0.5, f = sp - tp;
        vec2 w0 = f * ( -0.5 + f * ( 1.0 - 0.5 * f ) ), w1 = 1.0 + f * f * ( -2.5 + 1.5 * f ), w2 = f * ( 0.5 + f * ( 2.0 - 1.5 * f ) ), w3 = f * f * ( -0.5 + 0.5 * f );
        vec2 w12 = w1 + w2, tc12 = ( tp + w2 / w12 ) * uOutTexel, tc0 = ( tp - 1.0 ) * uOutTexel, tc3 = ( tp + 2.0 ) * uOutTexel;
        vec3 r = texture2D( tHist, vec2( tc12.x, tc0.y ) ).rgb * ( w12.x * w0.y ) + texture2D( tHist, vec2( tc0.x, tc12.y ) ).rgb * ( w0.x * w12.y )
          + texture2D( tHist, vec2( tc12.x, tc12.y ) ).rgb * ( w12.x * w12.y ) + texture2D( tHist, vec2( tc3.x, tc12.y ) ).rgb * ( w3.x * w12.y )
          + texture2D( tHist, vec2( tc12.x, tc3.y ) ).rgb * ( w12.x * w3.y );
        float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
        return max( r / ws, 0.0 );
      }
      vec3 clipBox( vec3 h, vec3 mn, vec3 mx ) {
        vec3 c = 0.5 * ( mx + mn ), e = 0.5 * ( mx - mn ) + 1e-5, v = h - c, u = abs( v / e );
        float m = max( u.x, max( u.y, u.z ) );
        return m > 1.0 ? c + v / m : h;
      }
      void main() {
        // this output pixel in input-pixel coordinates; input texel k's sample sits at k + 0.5 + jitter
        vec2 ip = vUv * uInSize - uJitter;
        vec2 base = floor( ip - 0.5 );
        vec3 acc = vec3( 0.0 ); float wsum = 0.0, wmax = 0.0;
        vec3 mn = vec3( 1e9 ), mx = vec3( -1e9 ), m1 = vec3( 0.0 ), m2 = vec3( 0.0 );
        float dNear = 1.0; vec2 nearUv = vUv;
        for ( int j = 0; j < 3; j++ ) for ( int i = 0; i < 3; i++ ) {
          vec2 t = base + vec2( float( i ), float( j ) );           // input texel (integer coords)
          vec2 suv = ( t + 0.5 ) * uInTexel;
          vec3 y = toY( tm( texture2D( tCur, suv ).rgb ) );
          vec2 dlt = ( t + 0.5 ) - ip;                               // sample-to-pixel distance in input pixels
          float w = exp( -2.29 * dot( dlt, dlt ) );                  // Blackman-Harris-like gaussian (radius ~1 px)
          acc += y * w; wsum += w; wmax = max( wmax, w );
          mn = min( mn, y ); mx = max( mx, y ); m1 += y; m2 += y * y;
          float d = texture2D( tDepth, suv ).x; if ( d < dNear ) { dNear = d; nearUv = suv; } // nearest depth (dilation)
        }
        vec3 yc = acc / max( wsum, 1e-4 );
        float vz = linZd( dNear );
        if ( uReset > 0.5 ) { gl_FragColor = vec4( itm( fromY( yc ) ), vz ); return; }
        vec3 mu = m1 / 9.0, sd = sqrt( max( m2 / 9.0 - mu * mu, 0.0 ) );
        // reprojection (velocity for moving objects, depth for the static world), from the nearest-depth input texel
        vec4 vel = uVelOn > 0.5 ? texture2D( tVel, nearUv ) : vec4( 0.0 );
        vec2 puv; float expD;
        if ( vel.a > 0.0 && vel.b <= vz + 0.02 * vz + 0.08 ) { puv = vUv - vel.rg; expD = vel.a; }
        else {
          vec4 w = uInvVP * vec4( vUv * 2.0 - 1.0, dNear * 2.0 - 1.0, 1.0 );
          vec4 pc = uPrevVP * w; puv = pc.xy / pc.w * 0.5 + 0.5; expD = dNear >= 0.99995 ? 6.0e4 : pc.w;
        }
        bool inside = all( greaterThanEqual( puv, vec2( 0.0 ) ) ) && all( lessThanEqual( puv, vec2( 1.0 ) ) );
        if ( !inside ) { gl_FragColor = vec4( itm( fromY( yc ) ), vz ); return; }
        float motion = length( ( puv - vUv ) / uOutTexel );
        // disocclusion against the history depth (alpha) of the nearest output texel
        float hd = texture2D( tHist, puv ).a;
        float disocc = expD < 5.0e4 ? smoothstep( 0.03 * expD + 0.06, 0.08 * expD + 0.25, abs( hd - expD ) ) : 0.0;
        float g = mix( mix( 1.25, 0.9, clamp( motion / 6.0, 0.0, 1.0 ) ), 0.6, disocc );
        vec3 bmn = max( mn, mu - g * sd ), bmx = min( mx, mu + g * sd );
        vec3 h = clipBox( toY( tm( histCR( puv ) ) ), bmn, bmx );
        // confidence: a sample landing right on this output pixel (wmax near 1) counts fully; between samples the history
        // carries the detail. The rest blend scales with the upscale ratio (more frames to fill more output pixels).
        float scale2 = ( uInTexel.x * uInTexel.y ) / ( uOutTexel.x * uOutTexel.y );   // output pixels per input pixel
        float a = mix( uBlendRest / max( 1.0, scale2 ), 0.2, clamp( motion / 24.0, 0.0, 1.0 ) ) * mix( 0.35, 1.0, wmax );
        a = mix( a, 0.6, disocc );
        float wc = a / ( 1.0 + yc.x ), wh = ( 1.0 - a ) / ( 1.0 + h.x );
        vec3 o = ( yc * wc + h * wh ) / ( wc + wh );
        gl_FragColor = vec4( itm( max( fromY( o ), 0.0 ) ), vz );
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const sc = new THREE.Scene();
  sc.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const opts = {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  };
  const hist = [new THREE.WebGLRenderTarget(4, 4, opts), new THREE.WebGLRenderTarget(4, 4, opts)];
  let flip = 0,
    reset = true;
  return {
    material: mat,
    hist,
    invalidate() {
      reset = true;
    },
    // a scale change keeps the history (it is at the output size): only the input texel size changes
    setSize(inW, inH, outW, outH) {
      const U = mat.uniforms;
      U.uInTexel.value.set(1 / inW, 1 / inH);
      U.uInSize.value.set(inW, inH);
      if (hist[0].width !== outW || hist[0].height !== outH) {
        hist[0].setSize(outW, outH);
        hist[1].setSize(outW, outH);
        reset = true;
      }
      U.uOutTexel.value.set(1 / outW, 1 / outH);
    },
    // returns the output-size history target holding this frame (alpha = depth; copy it with alpha forced to 1)
    render(r, p) {
      const U = mat.uniforms,
        dst = hist[flip],
        src = hist[1 - flip];
      U.tCur.value = p.cur;
      U.tHist.value = src.texture;
      U.tDepth.value = p.depth;
      U.tVel.value = p.vel || null;
      U.uVelOn.value = p.velOn ? 1 : 0;
      U.uInvVP.value.copy(p.invVP);
      U.uPrevVP.value.copy(p.prevVP);
      U.uJitter.value.set(p.jitterPx[0], p.jitterPx[1]);
      U.uNear.value = p.near;
      U.uFar.value = p.far;
      U.uReset.value = reset || p.reset ? 1 : 0;
      reset = false;
      const prev = r.getRenderTarget();
      r.setRenderTarget(dst);
      r.render(sc, cam);
      r.setRenderTarget(prev);
      flip = 1 - flip;
      return dst;
    },
    dispose() {
      hist[0].dispose();
      hist[1].dispose();
      mat.dispose();
      quad.geometry.dispose();
    },
  };
}

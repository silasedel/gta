// Display-referred (post-OutputPass) cinematic grade: split toning, filmic contrast, saturation,
// lift/gamma/gain, sun glare + lens ghosts with cheap occlusion test, radial speed blur,
// chromatic aberration at edges, vignette, film grain.
export const GradeShader = {
  name: 'PortSolanaGrade',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: [1, 1] },
    uAspect: { value: 1 },
    uSpeed: { value: 0 },
    uCA: { value: 0.0 }, // no constant edge fringe: aberration only appears with speed (uSpeed)
    uGrain: { value: 0.0 }, // stage 1: no film grain in gameplay (user: grain is the main complaint); cinema.js may scale it
    uSharp: { value: 0.45 },
    uVignette: { value: 0.2 },
    uSat: { value: 1.14 },
    uContrast: { value: 0.37 },
    uToe: { value: 0 }, // black point: crushes the haze-lifted floor so sun and shade separate
    uLift: { value: [0.0, 0.004, 0.012] },
    uGamma: { value: [1.0, 1.0, 1.0] },
    uGain: { value: [1.03, 1.0, 0.96] },
    uShadowTint: { value: [-0.015, 0.012, 0.03] },
    uHighTint: { value: [0.035, 0.012, -0.03] },
    uSunPos: { value: [0.5, 0.5] },
    uSunOn: { value: 0 },
    uRays: { value: 0 },
    uUnder: { value: 0 },
    uSunColor: { value: [1, 0.7, 0.4] },
    uStable: { value: 0 }, // look3: sun-shaft ray offsets stay fixed per pixel (a per-frame random offset after TAA is grain)
    // r2-look: matched color grade (tools/v2/look/lut-match.py): 32^3 LUT as a 1024 x 32 strip, display values in / out
    tLut: { value: null },
    uLutMix: { value: 0 },
    uChromaKnee: { value: 0 }, // r2-look: soft chroma roll-off above ~0.4 (bougainvillea, lawn greens read neon)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tLut;
    uniform float uLutMix;
    uniform float uChromaKnee;
    vec3 lutS( vec3 c ) {
      c = clamp( c, 0.0, 1.0 );
      float b = c.b * 31.0, b0 = floor( b ), b1 = min( b0 + 1.0, 31.0 );
      vec2 p = vec2( c.r * 31.0 + 0.5, c.g * 31.0 + 0.5 );
      vec3 s0 = texture2D( tLut, vec2( ( b0 * 32.0 + p.x ) / 1024.0, p.y / 32.0 ) ).rgb;
      vec3 s1 = texture2D( tLut, vec2( ( b1 * 32.0 + p.x ) / 1024.0, p.y / 32.0 ) ).rgb;
      return mix( s0, s1, b - b0 );
    }
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uAspect;
    uniform float uSpeed;
    uniform float uCA;
    uniform float uGrain;
    uniform float uSharp;
    uniform float uVignette;
    uniform float uSat;
    uniform float uContrast;
    uniform float uToe;
    uniform vec3 uLift;
    uniform vec3 uGamma;
    uniform vec3 uGain;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform vec2 uSunPos;
    uniform float uSunOn;
    uniform float uRays;
    uniform float uUnder;
    uniform vec3 uSunColor;
    uniform float uStable;
    varying vec2 vUv;

    float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
    float luma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

    vec3 sampleCA( vec2 uv, vec2 dc, float amt ) {
      vec3 c;
      c.r = texture2D( tDiffuse, uv - dc * amt ).r;
      c.g = texture2D( tDiffuse, uv ).g;
      c.b = texture2D( tDiffuse, uv + dc * amt ).b;
      return c;
    }

    void main() {
      vec2 uv = vUv;
      if ( uUnder > 0.001 ) uv += uUnder * vec2( sin( uv.y * 40.0 + uTime * 2.3 ), cos( uv.x * 33.0 + uTime * 1.9 ) ) * 0.0035;
      vec2 dc = uv - 0.5;
      float r2 = dot( dc * vec2( uAspect, 1.0 ), dc * vec2( uAspect, 1.0 ) );
      float ca = uCA * r2 * 2.0 + uSpeed * r2 * 0.006;
      vec3 col;
      if ( uSpeed > 0.01 ) {
        // radial streaks: blur outward from the center, stronger at the edges
        float amt = uSpeed * 0.035 * smoothstep( 0.08, 0.45, r2 ); // edges only, centre stays sharp
        col = vec3( 0.0 );
        float wsum = 0.0;
        for ( int i = 0; i < 8; i++ ) {
          float t = float( i ) / 7.0;
          float w = 1.0 - t * 0.6;
          col += sampleCA( uv - dc * amt * t, dc, ca ) * w;
          wsum += w;
        }
        col /= wsum;
      } else {
        col = sampleCA( uv, dc, ca );
        if ( uSharp > 0.001 ) {
          // mild unsharp mask (restores the crispness SMAA and resolution scaling take away); clamped so edges never ring
          vec2 px = 1.0 / uRes;
          vec3 nb = ( texture2D( tDiffuse, uv + vec2( px.x, 0.0 ) ).rgb + texture2D( tDiffuse, uv - vec2( px.x, 0.0 ) ).rgb + texture2D( tDiffuse, uv + vec2( 0.0, px.y ) ).rgb + texture2D( tDiffuse, uv - vec2( 0.0, px.y ) ).rgb ) * 0.25;
          col += clamp( col - nb, -0.1, 0.1 ) * uSharp;
        }
      }

      // --- sun glare & lens ghosts ---
      if ( uSunOn > 0.001 ) {
        // occlusion: probe the sun area for very bright sky
        float vis = 0.0;
        vec2 px = 6.0 / uRes;
        vis += step( 0.97, luma( texture2D( tDiffuse, uSunPos ).rgb ) );
        vis += step( 0.97, luma( texture2D( tDiffuse, uSunPos + vec2( px.x, 0.0 ) ).rgb ) );
        vis += step( 0.97, luma( texture2D( tDiffuse, uSunPos - vec2( px.x, 0.0 ) ).rgb ) );
        vis += step( 0.97, luma( texture2D( tDiffuse, uSunPos + vec2( 0.0, px.y ) ).rgb ) );
        vis += step( 0.97, luma( texture2D( tDiffuse, uSunPos - vec2( 0.0, px.y ) ).rgb ) );
        vis = vis / 5.0 * uSunOn;
        vis *= step( 0.0, uSunPos.x ) * step( uSunPos.x, 1.0 ) * step( 0.0, uSunPos.y ) * step( uSunPos.y, 1.0 );
        vec2 sd = ( uv - uSunPos ) * vec2( uAspect, 1.0 );
        float d = length( sd );
        vec3 glare = uSunColor * ( exp( -d * 12.0 ) * 0.04 + exp( -d * 40.0 ) * 0.14 ); // look track: tighter, weaker glare (was 0.10 / 0.25)
        // anamorphic streak
        glare += uSunColor * vec3( 0.6, 0.8, 1.0 ) * exp( -abs( sd.y ) * 220.0 ) * exp( -abs( sd.x ) * 2.5 ) * 0.07;
        // ghosts along the sun->center axis
        vec2 axis = vec2( 0.5 ) - uSunPos;
        for ( int i = 0; i < 4; i++ ) {
          float k = 0.45 + float( i ) * 0.42;
          vec2 gp = uSunPos + axis * k * 1.6;
          float gd = length( ( uv - gp ) * vec2( uAspect, 1.0 ) );
          float rad = 0.02 + 0.03 * float( i );
          float ring = smoothstep( rad, rad * 0.7, gd ) * 0.008 + smoothstep( rad * 1.05, rad, gd ) * smoothstep( rad * 0.85, rad, gd ) * 0.007;
          vec3 tint = i == 0 ? vec3( 1.0, 0.6, 0.3 ) : ( i == 1 ? vec3( 0.4, 1.0, 0.6 ) : ( i == 2 ? vec3( 0.5, 0.6, 1.0 ) : vec3( 1.0, 0.4, 0.7 ) ) );
          glare += tint * ring;
        }
        col += glare * vis;
      }

      // --- screen-space sun shafts (god rays through gaps in buildings / clouds) ---
      if ( uRays > 0.001 ) {
        vec2 delta = ( uv - uSunPos );
        float dl = length( delta * vec2( uAspect, 1.0 ) );
        vec2 stp = delta * ( 0.85 / 20.0 );
        vec2 ruv = uv - stp * ( uStable > 0.5 ? fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) : hash12( uv * uRes + uTime ) );
        float illum = 1.0;
        float acc = 0.0;
        for ( int i = 0; i < 20; i++ ) {
          ruv -= stp;
          float b = luma( texture2D( tDiffuse, clamp( ruv, 0.001, 0.999 ) ).rgb );
          acc += smoothstep( 0.8, 1.0, b ) * illum;
          illum *= 0.93;
        }
        acc /= 20.0;
        col += uSunColor * acc * uRays * exp( -dl * 1.6 ) * 1.0;
      }

      // underwater: absorb reds, blue-green murk, caustic shimmer
      if ( uUnder > 0.001 ) {
        float caus = sin( uv.x * 60.0 + uTime * 2.0 + sin( uv.y * 40.0 + uTime ) ) * sin( uv.y * 55.0 - uTime * 1.6 );
        vec3 wcol = col * vec3( 0.35, 0.8, 0.9 ) + vec3( 0.0, 0.03, 0.04 ) + max( caus, 0.0 ) * 0.04 * smoothstep( 0.2, 1.0, uv.y );
        col = mix( col, wcol, uUnder );
      }

      // --- grade ---
      col = max( col, 0.0 );
      col = max( col - uToe, 0.0 ) / ( 1.0 - uToe );
      float l = luma( col );
      col += uShadowTint * ( 1.0 - l ) * ( 1.0 - l ) + uHighTint * l * l;
      col = uGain * ( col + uLift * ( 1.0 - col ) );
      col = pow( max( col, 0.0 ), 1.0 / uGamma );
      vec3 sc = clamp( col, 0.0, 1.0 );
      col = mix( col, sc * sc * ( 3.0 - 2.0 * sc ), uContrast );
      l = luma( col );
      col = mix( vec3( l ), col, uSat );

      // r2-look: high-chroma roll-off (film-like): chroma above ~0.4 is compressed toward the pixel's luma, at most 22%
      if ( uChromaKnee > 0.001 ) {
        float mxC = max( col.r, max( col.g, col.b ) ), mnC = min( col.r, min( col.g, col.b ) ), lC = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
        float kC = smoothstep( 0.38, 0.85, mxC - mnC ) * 0.22 * uChromaKnee;
        col = mix( col, vec3( lC ), kC );
      }
      // r2-look matched grade (the mock-up's tonal / color statistics, regularized)
      if ( uLutMix > 0.001 ) col = mix( col, lutS( col ), uLutMix );

      // vignette
      float vig = smoothstep( 1.05, 0.2, sqrt( r2 ) * 1.35 );
      col *= mix( 1.0, vig, uVignette );

      // grain (luma-weighted, stronger in mids)
      if ( uGrain > 0.0 ) {
        float g = hash12( uv * uRes + fract( uTime * 61.7 ) * 400.0 ) - 0.5;
        col += g * uGrain * ( 0.35 + 0.65 * ( 1.0 - abs( l - 0.5 ) * 2.0 ) );
      }
      // static sub-LSB dither (+-0.5/255): removes 8-bit banding in sky gradients, invisible as noise
      col += ( hash12( gl_FragCoord.xy ) - 0.5 ) / 255.0;

      gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
    }`,
};

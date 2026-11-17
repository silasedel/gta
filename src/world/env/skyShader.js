import * as THREE from 'three';
import { HAZE_GLSL, LOOK_OFF } from './fogChunks.js';

// Physical (Preetham) sky + procedural clouds (cumulus + cirrus) + stars + moon,
// horizon blended into the scene fog so geometry fades seamlessly into the sky.
export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    name: 'PortSolanaSky',
    uniforms: {
      sunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
      moonDir: { value: new THREE.Vector3(0, 0.5, 1).normalize() },
      lightDir: { value: new THREE.Vector3(0, 1, 0) },
      lightColor: { value: new THREE.Color(1, 1, 1) },
      uTime: { value: 0 },
      rayleigh: { value: 2.0 },
      turbidity: { value: 8.0 },
      mieCoefficient: { value: 0.006 },
      mieDirectionalG: { value: 0.86 },
      uSkyExposure: { value: 1.0 },
      uSkySat: { value: 1.2 },
      uArt: { value: 1.0 },
      uZenith: { value: new THREE.Color(0.1, 0.25, 0.6) },
      uHorizon: { value: new THREE.Color(0.5, 0.6, 0.75) },
      uHorizonSun: { value: new THREE.Color(1, 0.8, 0.6) },
      uSunGlow: { value: new THREE.Color(1, 0.9, 0.8) },
      uNight: { value: 0 },
      uFogColor: { value: new THREE.Color(0.7, 0.5, 0.4) },
      uHorizonBlend: { value: 1.0 },
      uCloudCover: { value: 0.385 },
      // stage 1 weather: overcast deck (0..1), its color, and a lightning flash (0..1+)
      uOvercast: { value: 0 }, uOvercastCol: { value: new THREE.Color(0.5, 0.52, 0.55) }, uFlash: { value: 0 },
      uNightCloud: { value: 1.0 }, // look track: 1 = moon-lit dim night clouds, 0 = old look (A/B)
      uCloudOff: { value: new THREE.Vector2() },
      uCirrus: { value: 0.4 },
      uCloudAmbient: { value: new THREE.Color(0.5, 0.45, 0.5) },
      uCloudSun: { value: new THREE.Color(1, 0.6, 0.3) },
      uCirrusColor: { value: new THREE.Color(1, 0.5, 0.4) },
      uCloudR2: { value: 0 }, // r2-look: 1 = warped, crisper cumulus with darker bases (environment.js sets it from game.lookR2)
    },
    vertexShader: /* glsl */`
      uniform vec3 sunDir;
      uniform float rayleigh;
      uniform float turbidity;
      uniform float mieCoefficient;
      varying vec3 vDir;
      varying vec3 vBetaR;
      varying vec3 vBetaM;
      varying float vSunE;
      const float e = 2.718281828459045;
      const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
      const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
      const float cutoffAngle = 1.6110731556870734;
      const float steepness = 1.5;
      const float EE = 1000.0;
      float sunIntensity( float zenithAngleCos ) {
        zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
        return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
      }
      void main() {
        vDir = position;
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w;
        vec3 sd = normalize( sunDir );
        vSunE = sunIntensity( sd.y );
        vBetaR = totalRayleigh * rayleigh;
        float c = ( 0.2 * turbidity ) * 10E-18;
        vBetaM = 0.434 * c * MieConst * mieCoefficient;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir;
      uniform vec3 moonDir;
      uniform vec3 lightDir;
      uniform vec3 lightColor;
      uniform float uTime;
      uniform float mieDirectionalG;
      uniform float uSkyExposure;
      uniform float uSkySat;
      uniform float uArt;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uHorizonSun;
      uniform vec3 uSunGlow;
      uniform float uNight;
      uniform vec3 uFogColor;
      uniform float uHorizonBlend;
      uniform float uCloudCover; uniform float uOvercast; uniform vec3 uOvercastCol; uniform float uFlash;
      uniform vec2 uCloudOff;
      uniform float uCirrus;
      uniform vec3 uCloudAmbient;
      uniform float uNightCloud;
      uniform vec3 uCloudSun;
      uniform float uCloudR2;
      uniform vec3 uCirrusColor;
      varying vec3 vDir;
      varying vec3 vBetaR;
      varying vec3 vBetaM;
      varying float vSunE;
      const float pi = 3.141592653589793;
      const float rayleighZenithLength = 8.4E3;
      const float mieZenithLength = 1.25E3;
      const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
      const float ONE_OVER_FOURPI = 0.07957747154594767;

      float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
      float hash13( vec3 p3 ) { p3 = fract( p3 * 0.1031 ); p3 += dot( p3, p3.zyx + 31.32 ); return fract( ( p3.x + p3.y ) * p3.z ); }
      vec3 hash33( vec3 p3 ) { p3 = fract( p3 * vec3( 0.1031, 0.1030, 0.0973 ) ); p3 += dot( p3, p3.yxz + 33.33 ); return fract( ( p3.xxy + p3.yxx ) * p3.zyx ); }
      float vnoise( vec2 p ) {
        vec2 i = floor( p ); vec2 f = fract( p );
        vec2 u = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( hash12( i ), hash12( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash12( i + vec2( 0.0, 1.0 ) ), hash12( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
      }
      const mat2 ROT = mat2( 0.8, -0.6, 0.6, 0.8 );
      float fbm5( vec2 p ) {
        float a = 0.5, s = 0.0;
        for ( int i = 0; i < 5; i++ ) { s += a * vnoise( p ); p = ROT * p * 2.03 + 17.1; a *= 0.5; }
        return s;
      }
      float fbm3( vec2 p ) {
        float a = 0.5, s = 0.0;
        for ( int i = 0; i < 3; i++ ) { s += a * vnoise( p ); p = ROT * p * 2.1 + 5.3; a *= 0.5; }
        return s;
      }
      // distance (in cloud-base heights) to a cloud shell at height h over a small curved planet: clouds keep their
      // shape toward the horizon instead of smearing into streaks
      float cloudDist( float y, float h ) { const float R = 9.0; return sqrt( R * R * y * y + 2.0 * R * h + h * h ) - R * y; }
      float worley( vec2 p ) {
        vec2 i = floor( p ), f = fract( p ); float md = 1.0;
        for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
          vec2 g = vec2( float( x ), float( y ) );
          vec2 o = hash33( vec3( i + g, 7.0 ) ).xy;
          md = min( md, length( g + o - f ) );
        }
        return 1.0 - md;
      }
      float cloudShape( vec2 p ) {
        // r2-look: a low-frequency domain warp breaks the round worley cells into irregular cumulus outlines
        // (post.js cloud-shadow map repeats this function: keep both in sync)
        if ( uCloudR2 > 0.5 ) p += ( vec2( vnoise( p * 0.45 + 3.1 ), vnoise( p * 0.45 + 8.7 ) ) - 0.5 ) * 0.35;
        float base = vnoise( p * 0.33 + 31.0 ) * 0.65 + vnoise( p * 0.71 ) * 0.35;                                   // where the cloud fields are
        float cells = worley( p * 0.85 + 11.0 );                          // round individual clouds of varied size                         // individual clouds of varied size
        float bil = worley( p * 3.1 + 7.0 );                                 // billows
        float det = fbm3( p * 5.2 + 3.0 );
        return base * 0.28 + cells * 0.39 + bil * 0.18 + det * 0.15;
      }
      float rayleighPhase( float cosTheta ) { return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) ); }
      float hgPhase( float cosTheta, float g ) {
        float g2 = g * g;
        float inv = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
        return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inv );
      }

      ${HAZE_GLSL}
      void main() {
        vec3 dir = normalize( vDir );
        vec3 sd = normalize( sunDir );
        vec3 up = vec3( 0.0, 1.0, 0.0 );

        // --- Preetham scattering (skipped when the artist gradient fully replaces it) ---
        vec3 col = vec3( 0.0 );
        float cosTheta = dot( dir, sd );
        if ( uArt < 0.999 ) {
        float zenithAngle = acos( max( 0.0, dot( up, dir ) ) );
        float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
        float sR = rayleighZenithLength * inverse;
        float sM = mieZenithLength * inverse;
        vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );
        float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
        vec3 betaRTheta = vBetaR * rPhase;
        float mPhase = hgPhase( cosTheta, mieDirectionalG );
        vec3 betaMTheta = vBetaM * mPhase;
        vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
        Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 0.5 ) ), clamp( pow( 1.0 - dot( up, sd ), 5.0 ), 0.0, 1.0 ) );
        vec3 L0 = vec3( 0.1 ) * Fex;
        vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
        col = pow( texColor, vec3( 1.0 / 2.4 ) ) * uSkyExposure;
        // richer, more saturated scattering (stylised golden hour)
        float skyL = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
        col = max( mix( vec3( skyL ), col, uSkySat ), 0.0 );
        }
        // artist-directed gradient sky (keyframed in JS by sun elevation), blended over Preetham
        {
          float hh = max( dir.y, 0.0 );
          vec3 art = mix( uHorizon, uZenith, pow( hh, 0.42 ) );
          float sunSide = pow( cosTheta * 0.5 + 0.5, 2.2 );
          float band = exp( -hh * 5.0 );
          art = mix( art, uHorizonSun, clamp( sunSide * band, 0.0, 1.0 ) );
          float cp = max( cosTheta, 0.0 );
          art += uSunGlow * ( pow( cp, 6.0 ) * 0.22 + pow( cp, 48.0 ) * 0.6 + pow( cp, 600.0 ) * 1.5 );
          col = mix( col, art, uArt );
        }
        // --- night sky ---
        float dy = max( dir.y, 0.0 );
        vec3 nightCol = mix( vec3( 0.020, 0.030, 0.070 ), vec3( 0.0025, 0.0045, 0.014 ), pow( dy, 0.5 ) );
        col += nightCol * uNight * 0.25;

        // sun disk (bright HDR for bloom), slightly larger than physical for drama
        float sunDisk = smoothstep( 0.99965, 0.99985, cosTheta );
        vec3 sunDiskCol = mix( vec3( 1.0, 0.35, 0.12 ), vec3( 1.0, 0.85, 0.65 ), smoothstep( 0.0, 0.3, sd.y ) ) * 40.0 * smoothstep( -0.03, 0.01, sd.y );
        // stars
        vec3 sp = dir * 320.0;
        vec3 cell = floor( sp );
        float h = hash13( cell );
        vec3 jit = hash33( cell ) * 0.6 + 0.2;
        float sDist = length( fract( sp ) - jit );
        float star = step( 0.9965, h ) * smoothstep( 0.09, 0.0, sDist ) * ( 0.6 + 2.5 * fract( h * 937.1 ) );
        star *= 0.65 + 0.35 * sin( uTime * ( 2.0 + 6.0 * fract( h * 71.3 ) ) + h * 50.0 );
        vec3 starCol = mix( vec3( 1.0, 0.85, 0.7 ), vec3( 0.7, 0.85, 1.0 ), fract( h * 413.7 ) );
        // milky band
        float band = exp( -pow( dot( dir, normalize( vec3( 0.3, 0.2, 1.0 ) ) ) * 3.2, 2.0 ) );
        vec3 milky = vec3( 0.025, 0.028, 0.045 ) * band * fbm3( dir.xz / ( dir.y + 0.4 ) * 6.0 );
        vec3 stars = ( starCol * star * 1.6 + milky ) * uNight * smoothstep( 0.0, 0.18, dir.y );

        // moon
        float md = dot( dir, normalize( moonDir ) );
        float moonDisk = smoothstep( 0.99955, 0.99970, md );
        float moonTex = 0.75 + 0.25 * vnoise( ( dir.xy - moonDir.xy ) * 900.0 );
        vec3 moon = vec3( 0.95, 0.97, 1.0 ) * ( moonDisk * 5.0 * moonTex + pow( max( md, 0.0 ), 600.0 ) * 0.25 + pow( max( md, 0.0 ), 30.0 ) * 0.03 );
        moon *= uNight * smoothstep( -0.02, 0.05, moonDir.y );

        col += stars + moon;
        // city light pollution glow over land (west of the coast) at night
        col += uNight * vec3( 0.06, 0.028, 0.022 ) * exp( -dy * 9.0 );

        // --- clouds: fair-weather cumulus, marched through a thin slab (flat bases, mounded sunlit tops) ---
        float cloudA = 0.0;
        if ( dir.y > 0.0 ) {
          vec2 toSun = normalize( sd.xz + vec2( 1e-4 ) );
          float fwd = pow( max( cosTheta, 0.0 ), 8.0 );
          float lowS = 1.0 - smoothstep( 0.05, 0.35, sd.y );
          float cov = 1.03 - uCloudCover;
          float T = 1.0;
          vec3 C = vec3( 0.0 );
          for ( int i = 0; i < 5; i++ ) {
            float hf = ( float( i ) + 0.5 ) / 5.0;
            vec2 p = dir.xz * cloudDist( dir.y, 1.0 + 0.09 * hf ) * 1.9 + uCloudOff;
            float n = cloudShape( p );
            float thr = cov + 0.15 * hf * hf;                 // tops are narrower than bases
            // r2-look: crisper cauliflower edges (narrower transition, fine erosion only near the edge)
            if ( uCloudR2 > 0.5 ) n += ( worley( p * 7.0 + 2.3 ) - 0.62 ) * 0.07 * ( 1.0 - smoothstep( thr, thr + 0.12, n ) ); // cauliflower billows at the rim
            float d = smoothstep( thr, thr + mix( 0.075, 0.05, uCloudR2 ), n );
            if ( d > 0.001 ) {
              float n2 = cloudShape( p + toSun * 0.14 );
              float shade = clamp( 0.50 + ( n - n2 ) * 9.0, 0.0, 1.0 );   // side facing the sun
              float thick = smoothstep( thr, thr + 0.16, n );             // 0 at the wispy edge, 1 deep inside
              vec3 amb = uCloudAmbient * ( 0.50 + 0.56 * hf ) * ( 1.0 - 0.42 * thick * ( 1.0 - hf ) ) * mix( 1.0, 0.8 + 0.2 * hf, uCloudR2 ); // r2-look: darker flat bases
              vec3 lit = uCloudSun * ( shade * ( 0.35 + 0.95 * hf ) + lowS * ( 1.0 - hf ) * 0.55 * ( 0.4 + 0.6 * shade ) );
              lit += uCloudSun * fwd * ( 1.0 - thick ) * ( 2.2 + 3.0 * lowS );   // backlit silver / pink rim
              float a = d * ( 0.50 + 0.30 * hf );
              C += T * a * ( amb + lit );
              T *= 1.0 - a;
            }
          }
          // look track: night clouds were bright unlit blobs. At night they are dim, moon-lit blue-grey.
          ${LOOK_OFF ? '' : 'C = mix( C, vec3( dot( C, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * vec3( 0.72, 0.82, 1.0 ) * 0.22, uNight * uNightCloud );'}
          float horizonFade = smoothstep( 0.0, 0.085, dir.y );
          cloudA = ( 1.0 - T ) * horizonFade;
          // thin high cirrus (amount varies by day)
          float t = 1.0 / ( dir.y + 0.035 );
          vec2 ciuv = dir.xz * t * 0.35 + uCloudOff * 0.3;
          float ci = fbm3( vec2( ciuv.x * 1.2, ciuv.y * 5.0 ) + fbm3( ciuv * 2.0 ) );
          float ciA = smoothstep( 0.62, 0.92, ci ) * 0.6 * uCirrus * smoothstep( 0.0, 0.25, dir.y );
          col = mix( col, uCirrusColor * ( 1.05 + 1.6 * fwd ), ciA * ( 1.0 - cloudA ) );
          col = col * ( 1.0 - cloudA ) + C * horizonFade;
          // stage 1 weather: overcast / storm deck, a layered grey ceiling with slow darker billows
          if ( uOvercast > 0.001 ) {
            vec2 op = dir.xz * cloudDist( dir.y, 1.0 ) * 0.9 + uCloudOff * 0.7;
            float ob = fbm3( op * 1.3 ) * 0.6 + fbm3( op * 3.7 + 5.0 ) * 0.4;
            vec3 deck = uOvercastCol * ( 0.72 + 0.5 * ob ) * ( 0.85 + 0.25 * pow( max( cosTheta, 0.0 ), 4.0 ) );
            deck += vec3( 0.75, 0.8, 1.0 ) * uFlash * ( 0.6 + 0.8 * ob );
            float oa = uOvercast * horizonFade;
            col = mix( col, deck, oa );
            cloudA = max( cloudA, oa );
          }
        }

        // --- horizon / fog matching (same in-scatter as the fog chunk) ---
        vec3 fogCol = psHazeColor( uFogColor, dir, normalize( lightDir ), lightColor );
        // a taller haze band by day (aerial perspective reaches higher up the sky than the old 6 degree blend)
        float hazeDay = ${LOOK_OFF ? '0.0' : 'smoothstep( 0.1, 0.5, normalize( lightDir ).y )'};
        float hb = 1.0 - smoothstep( -0.02, mix( 0.06, 0.22, hazeDay ), dir.y );
        hb = mix( hb, hb * hb * ( 3.0 - 2.0 * hb ), hazeDay );
        col = mix( col, fogCol, clamp( hb * uHorizonBlend, 0.0, 1.0 ) );

        // sun disk on top of horizon haze (dimmed by clouds)
        col += sunDiskCol * sunDisk * ( 1.0 - cloudA * 0.9 ) * ( 1.0 - uOvercast ) * smoothstep( -0.012, 0.004, dir.y );
        col += vec3( 0.7, 0.75, 0.9 ) * uFlash * 0.35 * ( 1.0 - smoothstep( 0.0, 0.6, dir.y ) * 0.5 ); // lightning lights the haze too
        col = min( col, vec3( 80.0 ) );
        gl_FragColor = vec4( col, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
}

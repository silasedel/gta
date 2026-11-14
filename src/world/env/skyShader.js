import * as THREE from 'three';
import { FOG_INSCATTER, FOG_INSCATTER_POW } from './fogChunks.js';

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
      uCloudAmbient: { value: new THREE.Color(0.5, 0.45, 0.5) },
      uCloudSun: { value: new THREE.Color(1, 0.6, 0.3) },
      uCirrusColor: { value: new THREE.Color(1, 0.5, 0.4) },
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
      uniform float uCloudCover;
      uniform vec3 uCloudAmbient;
      uniform vec3 uCloudSun;
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
      float rayleighPhase( float cosTheta ) { return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) ); }
      float hgPhase( float cosTheta, float g ) {
        float g2 = g * g;
        float inv = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
        return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inv );
      }

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

        // --- clouds ---
        float cloudA = 0.0;
        if ( dir.y > 0.0 ) {
          float t = 1.0 / ( dir.y + 0.035 );
          vec2 cuv = dir.xz * t * 0.9 + vec2( uTime * 0.0035, uTime * 0.0012 );
          float n = fbm5( cuv * 1.3 );
          float cov = 1.0 - uCloudCover;
          float dens = smoothstep( cov, cov + 0.26, n );
          vec2 toSun = normalize( sd.xz + vec2( 1e-4 ) );
          float n2 = fbm5( cuv * 1.3 + toSun * 0.11 );
          float lit = clamp( 0.55 + ( n - n2 ) * 5.0, 0.0, 1.0 );
          float fwd = pow( max( cosTheta, 0.0 ), 10.0 );
          float underside = smoothstep( 0.0, 0.6, n - cov );
          vec3 cloudCol = uCloudAmbient * ( 0.62 + 0.38 * ( 1.0 - underside ) ) + uCloudSun * ( lit * ( 0.85 + 3.2 * fwd ) + ( 1.0 - dens ) * fwd * 4.5 ) * ( 1.0 - 0.42 * underside );
          float horizonFade = smoothstep( 0.0, 0.16, dir.y );
          cloudA = dens * horizonFade * 0.96;
          // high cirrus streaks
          vec2 ciuv = dir.xz * t * 0.35 + vec2( uTime * 0.002, 0.0 );
          float ci = fbm3( vec2( ciuv.x * 1.2, ciuv.y * 5.0 ) + fbm3( ciuv * 2.0 ) );
          float ciA = smoothstep( 0.62, 0.92, ci ) * 0.30 * smoothstep( 0.0, 0.25, dir.y );
          col = mix( col, uCirrusColor * ( 1.05 + 1.6 * fwd ), ciA * ( 1.0 - cloudA ) );
          col = mix( col, cloudCol, cloudA );
        }

        // --- horizon / fog matching (same in-scatter as the fog chunk) ---
        vec3 fogCol = uFogColor + lightColor * ${FOG_INSCATTER.toFixed(4)} * pow( max( dot( dir, normalize( lightDir ) ), 0.0 ), ${FOG_INSCATTER_POW.toFixed(1)} );
        float hb = 1.0 - smoothstep( -0.02, 0.06, dir.y );
        col = mix( col, fogCol, clamp( hb * uHorizonBlend, 0.0, 1.0 ) );

        // sun disk on top of horizon haze (dimmed by clouds)
        col += sunDiskCol * sunDisk * ( 1.0 - cloudA * 0.9 ) * smoothstep( -0.012, 0.004, dir.y );
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

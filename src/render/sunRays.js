// Cinematic pass (Nov 19, user: "very generic, terrible lighting"; reference: golden-hour light through hazy air with
// visible sun shafts through palms). Screen-space sun shafts ("god rays"):
//   1. mask (quarter resolution): open sky near the sun, from the scene depth, weighted by its exposed brightness, so
//      every palm frond, roof and wire in front of the sun cuts a dark gap into it;
//   2. two radial blurs toward the sun (quarter resolution, 20 taps each: 400 effective samples, no banding).
// The grade pass (gradeShader.js, tRays) adds the result on screen as a soft screen blend tinted by the sun: no extra
// full-resolution pass, so the whole effect costs about two quarter-resolution draws (well under 0.3 ms at 1440p).
// Runs only while the sun is in or near the view (cine.js sets k; off = skipped, no cost).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

// sky pixels near the sun, by exposed brightness (soft-saturated: a dim overcast sky gives little)
const MASK_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uSun;
uniform float uAspect;
uniform float uExp;
varying vec2 vUv;
void main() {
  float d = texture2D( tDepth, vUv ).x;
  float sky = step( 0.99995, d );
  vec3 c = texture2D( tColor, vUv ).rgb;
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) * uExp;
  vec2 dv = ( vUv - uSun ) * vec2( uAspect, 1.0 );
  float near = exp( -dot( dv, dv ) * 6.0 );
  gl_FragColor = vec4( vec3( sky * near * ( 1.0 - exp( -l * 0.8 ) ) ), 1.0 );
}`;

// radial blur toward the sun; uSpan = share of the way to the sun this pass covers
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uSpan;
varying vec2 vUv;
void main() {
  const int N = 20;
  vec2 stepUv = ( uSun - vUv ) * uSpan / float( N );
  // fixed per-pixel offset (this runs after TAA: a per-frame offset would read as grain); it only breaks up banding
  float j = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
  vec2 p = vUv + stepUv * j;
  float acc = 0.0;
  float w = 1.0;
  float wsum = 0.0;
  for ( int i = 0; i < N; i++ ) {
    acc += texture2D( tSrc, p ).r * w;
    wsum += w;
    w *= 0.96;
    p += stepUv;
  }
  gl_FragColor = vec4( vec3( acc / wsum ), 1.0 );
}`;

export class SunRaysPass extends Pass {
  // getDepth(): this frame's scene depth texture (post.js swaps buffers)
  constructor(getDepth) {
    super();
    this.needsSwap = false; // writes only its own targets; the grade reads this.texture
    this.getDepth = getDepth;
    this.k = 0; // strength (0 = off)
    this.exposure = 1; // the renderer's tone-mapping exposure (mask brightness)
    this.sun = new THREE.Vector2(0.5, 0.5); // sun position in UV
    this.color = new THREE.Color(1, 0.8, 0.6); // sun hue (max channel 1)
    const rt = () =>
      new THREE.WebGLRenderTarget(4, 4, {
        type: THREE.HalfFloatType,
        depthBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    this.rtA = rt();
    this.rtB = rt();
    this.texture = this.rtA.texture;
    const mat = (frag, uniforms) =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: frag,
        depthTest: false,
        depthWrite: false,
      });
    this.mask = mat(MASK_FRAG, {
      tColor: { value: null },
      tDepth: { value: null },
      uSun: { value: this.sun },
      uAspect: { value: 1 },
      uExp: { value: 1 },
    });
    this.blur = mat(BLUR_FRAG, {
      tSrc: { value: null },
      uSun: { value: this.sun },
      uSpan: { value: 0.65 },
    });
    this.quad = new FullScreenQuad(this.mask);
  }

  setSize(w, h) {
    const qw = Math.max(1, Math.round(w / 4));
    const qh = Math.max(1, Math.round(h / 4));
    this.rtA.setSize(qw, qh);
    this.rtB.setSize(qw, qh);
    this.mask.uniforms.uAspect.value = w / Math.max(1, h);
  }

  drawInto(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  render(renderer, writeBuffer, readBuffer) {
    const depth = this.getDepth?.() || readBuffer.depthTexture;
    if (!depth) return;
    this.mask.uniforms.tColor.value = readBuffer.texture;
    this.mask.uniforms.tDepth.value = depth;
    this.mask.uniforms.uExp.value = this.exposure;
    this.drawInto(renderer, this.mask, this.rtA);
    // a long first pass, then a short second pass that fills the gaps between the first pass's taps
    this.blur.uniforms.tSrc.value = this.rtA.texture;
    this.blur.uniforms.uSpan.value = 0.65;
    this.drawInto(renderer, this.blur, this.rtB);
    this.blur.uniforms.tSrc.value = this.rtB.texture;
    this.blur.uniforms.uSpan.value = 0.65 / 20;
    this.drawInto(renderer, this.blur, this.rtA);
  }

  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.mask.dispose();
    this.blur.dispose();
    this.quad.dispose();
  }
}

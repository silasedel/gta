// Stage 1: one shared per-frame noise offset for every screen-space dither (LOD cross-fades, hair cards, crowd fades).
// A dither that is the same every frame shows as a fixed dot pattern; TAA can only resolve it when the pattern moves
// each frame. post.js advances this once per rendered frame (period 16, matched to the TAA history length).
// Use in GLSL: float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy + 5.588238 * uFrameN, vec2(0.06711056, 0.00583715))));
export const FRAME_NOISE = { value: 0 };
export const IGN_T_GLSL =
  'float ignT(vec2 p) { return fract(52.9829189 * fract(dot(p + 5.588238 * uFrameN, vec2(0.06711056, 0.00583715)))); }';
export function advanceFrameNoise() {
  FRAME_NOISE.value = (FRAME_NOISE.value + 1) % 16;
}
// r2-render (game.renderR2): the dithers step a fixed per-pixel IGN by the golden ratio each frame instead of offsetting
// the pixel position. Every pixel then walks evenly through all thresholds over the TAA history, so the average converges
// to the true fade with no per-pixel bias (the position offset left a fixed residual dot pattern at rest).
// RENDER_R2.value is set by post.js every frame. GLSL: uniform float uRenderR2; float psIgnT(vec2 p) (needs uFrameN).
export const RENDER_R2 = { value: 0 };
export const IGN_R2_GLSL =
  'float psIgnT(vec2 p) { return uRenderR2 > 0.5 ? fract(fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))) + 0.61803399 * uFrameN) : fract(52.9829189 * fract(dot(p + 5.588238 * uFrameN, vec2(0.06711056, 0.00583715)))); }';
// r2-render: alpha-to-coverage with a centered, width-capped edge. three's chunk spreads coverage over the alpha's
// screen gradient; on far foliage (leaflets near a pixel wide) that gradient is huge, so whole frond tips got fractional
// coverage, which the GPU dithers into a fixed 1-pixel checkerboard at 2x MSAA (it never moves, TAA cannot remove it).
// Capped, the coverage is near binary per pixel (MSAA still smooths the geometric edge) and the sub-pixel jitter turns
// it into real coverage over the TAA history. Drop-in for #include <alphatest_fragment>; needs uniform float uRenderR2.
export const A2C_R2_GLSL = `#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	{ float psW = fwidth( diffuseColor.a );
	if ( uRenderR2 > 0.5 ) { diffuseColor.a = step( alphaTest, diffuseColor.a ); } // r2-render (15:10): binary coverage; the sub-pixel TAA jitter supersamples it. Fractional A2C coverage became an ordered dot hatch on far fronds at 2x MSAA
	else diffuseColor.a = smoothstep( alphaTest, alphaTest + psW, diffuseColor.a ); }
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`;
// r2-render page flag (the material states that need a shader variant, e.g. alpha-to-coverage, are fixed at load):
// ?render2=1 / ?render2=0, else RENDER_R2_DEFAULT. post.js starts game.renderR2 from it (runtime A/B for the rest).
export const RENDER_R2_DEFAULT = true; // on since Nov 17 15:00 (abl1 / ab3: 0 console errors with ?render2=1, deck frame-to-frame noise half of the old TAA, no ghost doubles, crisp moving cars)
export const RENDER_R2_PAGE = (() => {
  const q = typeof location !== 'undefined' ? location.search : '';
  return /[?&]render2=1\b/.test(q) ? true : /[?&]render2=0\b/.test(q) ? false : RENDER_R2_DEFAULT;
})();
// Same, plus a small per-frame offset on fractional coverage only (needs uFrameN and IGN_R2_GLSL's psIgnT). Far fronds
// whose mip-averaged alpha sits near the threshold over whole areas still get fractional coverage, which the GPU turns into
// a fixed checkerboard at 2x MSAA; the offset changes which samples are covered each frame, so the TAA history averages
// it to the true coverage. Solid (coverage 1) and empty texels are untouched.
export const A2C_R2T_GLSL = A2C_R2_GLSL; // (kept for the vegetation import; the binary edge needs no per-frame offset)
// r2-render: the third-person camera's focus (player chest, world m), set by post.js each frame. Foliage between the
// camera and the focus, or within ~1.3 m of the camera, fades out by coverage (vegetation/materials.js).
export const CAM_FOCUS = { value: new Float32Array([0, -1e5, 0]) };

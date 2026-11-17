// Stage 1: one shared per-frame noise offset for every screen-space dither (LOD cross-fades, hair cards, crowd fades).
// A dither that is the same every frame shows as a fixed dot pattern; TAA can only resolve it when the pattern moves
// each frame. post.js advances this once per rendered frame (period 16, matched to the TAA history length).
// Use in GLSL: float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy + 5.588238 * uFrameN, vec2(0.06711056, 0.00583715))));
export const FRAME_NOISE = { value: 0 };
export const IGN_T_GLSL = 'float ignT(vec2 p) { return fract(52.9829189 * fract(dot(p + 5.588238 * uFrameN, vec2(0.06711056, 0.00583715)))); }';
export function advanceFrameNoise() { FRAME_NOISE.value = (FRAME_NOISE.value + 1) % 16; }

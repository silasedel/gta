// Underwater caustics (r2-ground): the bright, wobbling light network the wave surface focuses onto a shallow sandy bottom.
// Two drifting layers of animated cellular noise; the thin borders between cells (F2 - F1 small) are the bright lines, and the
// product of both layers gives the knotted, ever-changing look. GLSL only; used by the terrain (groundShader.js) and the
// seabed (miami/seabed.js) so both read the same light under the water.
//   CAUSTIC_GLSL defines float r2Caustic(vec2 worldXZ, float timeSeconds) -> 0..~1.5 (multiply into the albedo as 1 + k * c)
export const CAUSTIC_GLSL = /* glsl */ `
#ifndef R2_CAUSTIC
#define R2_CAUSTIC
vec2 r2cH2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float r2cLayer(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), h = r2cH2(i + g);
    vec2 o = 0.5 + 0.38 * sin(t * (0.6 + h * 0.5) + h * 6.2831);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return 1.0 - smoothstep(0.0, 0.16, d2 - d1);
}
float r2Caustic(vec2 w, float t) {
  vec2 warp = vec2(sin(w.y * 0.9 + t * 0.7), cos(w.x * 0.8 - t * 0.6)) * 0.12;
  float a = r2cLayer(w * 0.9 + warp + vec2(t * 0.05, t * 0.03), t);
  float b = r2cLayer(w * 1.37 - warp + vec2(-t * 0.04, t * 0.06) + 17.0, t * 1.13);
  return a * 0.6 + b * 0.4 + a * b * 0.9;
}
#endif
`;

// Cinematic look (Nov 19, user: "very generic, terrible lighting"; reference: a golden morning through hazy air, shafts
// through the palms, warm highlights, deep but open shadows, a slightly desaturated filmic grade, gentle vignette).
// Applied by post.js every frame on top of the existing time-of-day look (it only nudges the values post.js already
// set, so game.lookCine = false gives back the previous look in the same session; ?cine=0 starts with it off):
//   - golden hours by the clock (6-9 and 17-20, strongest near sunrise / sunset): warm gain and highlights, a thicker
//     warm haze floor (fogChunks.js reads LOOK_V.y), more bloom on the sun and highlights;
//   - between them a cleaner, brighter day; at night the grade stays as it was;
//   - screen-space sun shafts (sunRays.js) whenever the sun is in or near the view, strongest at golden hour;
//   - always: a filmic touch (slightly lower saturation, a firmer S-curve) and a subtle vignette.
// Weather: overcast / rain / fog damp the golden warmth, haze floor and shafts (no sun to scatter).
import * as THREE from 'three';
import { LOOK_V } from './look3.js';

const CINE_PAGE = !(typeof location !== 'undefined' && /[?&]cine=0\b/.test(location.search));
const ss = THREE.MathUtils.smoothstep;

// 0..1 bump: rises a..b, holds, falls c..d
function band(h, a, b, c, d) {
  return ss(h, a, b) * (1 - ss(h, c, d));
}

// Golden-hour weight by the clock (morning 6-9, evening 17-20), damped by cloud cover.
export function cineWeights(game) {
  const h = game.timeOfDay ?? 12;
  const env = game.env;
  const overcast = env?.sky?.material?.uniforms?.uOvercast?.value ?? 0;
  const fog = Math.min(1, (game.weather?.fog ?? 0) / 0.002);
  const clear = (1 - overcast) * (1 - fog);
  const morning = band(h, 5.6, 6.6, 8.2, 9.3);
  const evening = band(h, 16.6, 17.6, 19.6, 20.3);
  const gold = Math.max(morning, evening);
  const day = env?.dayFactor ?? 1;
  const indoor = env?.indoor || 0;
  return { gold: gold * (0.35 + 0.65 * clear), clear, day, indoor, midday: day * (1 - gold) };
}

// ctx: { game, gu (grade uniforms), bloom, sunRays, sunOn (0..1, sun in / near the view), sunPos (uv), exposure }
export function applyCine(ctx) {
  const { game, gu, bloom, sunRays } = ctx;
  if (game.lookCine === undefined) game.lookCine = CINE_PAGE;
  const on = game.lookCine !== false && !game.env?.underwater;
  if (!on) {
    sunRays.enabled = false;
    gu.uRaysCol.value.set(0, 0, 0);
    LOOK_V[1] = 0;
    return;
  }
  const w = cineWeights(game);
  const g = w.gold * (1 - w.indoor);
  const C = game.cine || (game.cine = { rays: 0.42, raysDay: 0.16, haze: 0.00022, vignette: 0.33 });

  // grade: warm gold highlights and gain at golden hour, shadows stay a touch cool so they read deep, not muddy
  gu.uGain.value.x *= 1 + 0.05 * g;
  gu.uGain.value.y *= 1 + 0.005 * g;
  gu.uGain.value.z *= 1 - 0.09 * g;
  gu.uHighTint.value.x += 0.03 * g;
  gu.uHighTint.value.y += 0.012 * g;
  gu.uHighTint.value.z -= 0.025 * g;
  gu.uShadowTint.value.x -= 0.004 * g;
  gu.uShadowTint.value.z += 0.008 * g;
  // filmic: slightly desaturated, firmer mid-tone S-curve (more at golden hour); a cleaner, crisper midday
  gu.uSat.value *= 0.95 - 0.03 * g + 0.03 * w.midday * w.clear;
  gu.uContrast.value += 0.05 + 0.04 * g;
  gu.uVignette.value = Math.max(gu.uVignette.value, C.vignette + 0.05 * g);

  // bloom: the sun disc and sunlit highlights glow, more at golden hour
  bloom.strength += 0.05 + 0.08 * g;
  bloom.threshold -= 0.06 + 0.08 * g;
  bloom.radius += 0.08 * g;

  // haze floor (fogChunks.js): warm humid air at golden hour, distant trees melt into it
  LOOK_V[1] = C.haze * g * w.day + 0.00003 * w.midday * w.clear;

  // sun shafts while the sun is in / near the view (sunRays.js mask + blur, added in the grade)
  const k =
    ctx.sunOn * w.day * w.clear * (1 - w.indoor) * (C.raysDay + (C.rays - C.raysDay) * w.gold);
  sunRays.enabled = k > 0.002;
  sunRays.k = k;
  if (sunRays.enabled) {
    sunRays.sun.copy(ctx.sunPos);
    sunRays.exposure = ctx.exposure ?? 1;
    const c = game.env.sun.color;
    const m = Math.max(c.r, c.g, c.b, 1e-3);
    gu.tRays.value = sunRays.texture;
    gu.uRaysCol.value.set((c.r / m) * k, (c.g / m) * 0.93 * k, (c.b / m) * 0.78 * k);
    gu.uRays.value = 0; // the old full-resolution grade rays are replaced
  } else gu.uRaysCol.value.set(0, 0, 0);
}

// Ground depth ladder (W4, Nov 19 playtest: "the road layers are the same height, so depending on the angle they glitch over
// each other"). ONE rule for every flat layer that can lie on top of another one: a layer drawn over another one is
//   (1) at least as high in y (the build's y stack below), and
//   (2) pulled further toward the camera by polygonOffset, by at least 2 depth steps per rung (units) and 0.25 x the depth
//       slope per rung (factor, for grazing angles and relief tiles whose layers are not exactly coplanar).
// The old stack had ties (parking = sidewalk = wood = promenade = panels = -4; covers / collars / lamp pools / grates at
// -2 under the -4/-6 surfaces they sit on) and inversions (asphalt at y 0.05 pulled harder than paved areas, so at range a
// 2 cm gap and a 2-step offset fought). A depth step is constant in window depth, so the offset grows with distance (d^2 / near)
// exactly the way 24-bit depth precision falls off; the y stack handles the near field, the offset the far field.
// y stack (m over the graded ground): land 0, sand 0.01, grass 0.02, paved / parking / wood 0.03, asphalt 0.05,
// junction 0.055, shoulder 0.058, decals 0.062, markings 0.065, lines 0.066, sidewalk slabs CURB 0.15.
// ?ladder=0 = the old offsets.
export const LADDER_ON = !(
  typeof location !== 'undefined' && /[?&]ladder=0\b/.test(location.search)
);
// rung: [units, factor]
export const LADDER = {
  land: [-1, -0.5], // unchanged (dressing.v2.js looks the land material up by these exact values)
  sand: [-2, -0.75],
  grass: [-3, -1],
  parking: [-4, -1.25],
  wood: [-5, -1.5],
  sidewalk: [-7, -1.75],
  promenade: [-7, -1.75],
  panels: [-7, -1.75],
  paving2: [-8, -1.875], // a dressing pavement laid over the sidewalk slab (brickellRow), under the grates / pools below
  overSidewalk: [-9, -2], // tree grates, mulch collars, lamp light pools, flush covers on a sidewalk
  dirtRoad: [-9, -2],
  asphalt: [-11, -2.25],
  junction: [-13, -2.5],
  shoulder: [-15, -2.75],
  decal: [-17, -3],
  cover: [-17, -3],
  markings: [-19, -3.25],
  lines: [-19, -3.25],
};
export function ladder(mat, key) {
  if (!LADDER_ON || !mat || !mat.isMaterial) return mat;
  const r = LADDER[key];
  if (!r) return mat;
  mat.polygonOffset = true;
  mat.polygonOffsetUnits = r[0];
  mat.polygonOffsetFactor = r[1];
  mat.userData.ladder = key;
  return mat;
}

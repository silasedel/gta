// snap: the generic eye / drive views stand on the nearest road (fixed cameras keep their coordinates)
// r2-art key places (player position [x, z] + fixed cameras [eyeX, eyeH, eyeZ, lookX, lookH, lookZ], heights above ground)
export const PLACES = {
  nico: { p: [-866.1, 4836.4], skip: ['drive0'] /* lands inside the house */, cams: { deck: [-871.5, 6.8, 4828.5, -852, 1.2, 4858], street: [-840, 1.8, 4851, -873, 3.0, 4826] } },
  downtown: { p: [407, -110], snap: 1, cams: { aerial: [380, 22, -60, 430, 6, -140] } },
  beach: { p: [2398, 660], cams: { ocean: [2380, 4, 640, 2450, 2.5, 700] } },
  rural: { p: [-1320, 3190], snap: 1, cams: {} },
  airport: { p: [-1210, 1045], snap: 1, cams: { apron: [-1300, 6, 1140, -1380, 8, 1075] } },
};

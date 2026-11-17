import fs from "node:fs";
// Ground-pass review spots: camera placed relative to the nearest road edge at each place (close-up / grazing / aerial).
//   node tools/v2/roads/mkspots.mjs > tools/v2/roads/spots/ground.json
// mode: close (1.7 m eye on the shoulder looking along the road), graze (0.6 m eye), side (eye beside the road, looking across
// the edge into the verge), aerial (40 m up, looking down at 50 deg)
const PLACES = { keys: [-873.6, 4825.2], keys2: [-937.6, 4883.2], downtown: [407, -110], resid: [-660, 600], beach: [2398, 660], rural: [-1540, -2805] };
const cam = (x, z, mode, tod, extra = '') => ({ player: null, tod, eval: `
  const G = game.city.roadGraph, q = G.nearestEdge(${x}, ${z}, {}, 200); if (q) { const e = q.edge, P = e.pts; let bi = 0, bd = 1e9; for (let i = 0; i < P.length - 1; i++) { const d = Math.hypot((P[i][0] + P[i + 1][0]) / 2 - ${x}, (P[i][1] + P[i + 1][1]) / 2 - ${z}); if (d < bd) { bd = d; bi = i; } }
  const a = P[bi], b = P[bi + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, nx = -dz, nz = dx, hw = e.width / 2, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const gy = (X, Z) => game.city.groundHeightAt(X, Z) || 0; const m = '${mode}'; let eye, look;
  if (m === 'close') { eye = [mx + nx * (hw * 0.35) - dx * 6, 0, mz + nz * (hw * 0.35) - dz * 6]; eye[1] = gy(eye[0], eye[2]) + 1.8; look = [mx + nx * (hw + 1.2) + dx * 7, 0, mz + nz * (hw + 1.2) + dz * 7]; look[1] = gy(look[0], look[2]); }
  else if (m === 'graze') { eye = [mx + nx * (hw - 0.6) - dx * 4, 0, mz + nz * (hw - 0.6) - dz * 4]; eye[1] = gy(eye[0], eye[2]) + 0.7; look = [mx + nx * (hw + 0.5) + dx * 12, 0, mz + nz * (hw + 0.5) + dz * 12]; look[1] = gy(look[0], look[2]); }
  else if (m === 'side') { eye = [mx - nx * (hw - 0.5), 0, mz - nz * (hw - 0.5)]; eye[1] = gy(eye[0], eye[2]) + 2.2; look = [mx + nx * (hw + 3), 0, mz + nz * (hw + 3)]; look[1] = gy(look[0], look[2]); }
  else { eye = [mx - nx * 22 - dx * 20, 0, mz - nz * 22 - dz * 20]; eye[1] = gy(mx, mz) + 38; look = [mx + nx * 2, gy(mx, mz), mz + nz * 2]; }
  game.teleport(eye[0] - nx * 3, undefined, eye[2] - nz * 3, 0); game.cameraOverride = (dt, c) => { c.position.fromArray(eye); c.lookAt(look[0], look[1], look[2]); return true; }; window.__gspot = { e: e.id, kind: e.kind, style: e.style, w: e.width, eye, look }; }
  ${extra}` });
const out = {};
for (const [k, [x, z]] of Object.entries(PLACES)) for (const m of ['close', 'graze', 'side', 'aerial']) out[`${k}_${m}`] = cam(x, z, m, 11);
out.keys_close_dusk = cam(-873.6, 4825.2, 'close', 18.5);
out.keys_close_rain = cam(-873.6, 4825.2, 'close', 11, "game.weather.set('rain', { instant: true });");
process.stdout.write(JSON.stringify(out, null, 1));
// terrain tour (user, 00:30: every terrain type): aerial + grazing per place -> tools/v2/roads/spots/terrain.json
const TERR = { cityLots: [-660, -55], park: [-300, -1700], beach: [2398, 660], dunes: [2332, -660], everglades: [-2600, 200], cypress: [-3800, -1500], farm: [-1800, -3300],
  okeechobee: [-2200, -6200], naples: [-4730, -220], fortMyers: [-5335, -3960], highway: [-1900, 4300], causeway: [1100, -400], airport: [-1210, 1045], homestead: [-1320, 3190], keyWest: [-4895, 5940], marathon: [-2783, 6600] };
const T2 = {}; for (const [k, [x, z]] of Object.entries(TERR)) { T2[`${k}_aerial`] = cam(x, z, 'aerial', 11); T2[`${k}_graze`] = cam(x, z, 'graze', 11); }
fs.writeFileSync(new URL('./spots/terrain.json', import.meta.url), JSON.stringify(T2, null, 1));
// city verges (lead, 01:45): tree lawns between curb and sidewalk around downtown / State Road 1042
const VERGE = { v1: [430, -90], v2: [380, -150], v3: [460, -160], v4: [350, -60], v5: [-640, -40], v6: [-700, 80] };
const V2 = {}; for (const [k, [x, z]] of Object.entries(VERGE)) { V2[`verge_${k}`] = cam(x, z, 'side', 11.5); }
fs.writeFileSync(new URL('./spots/verge.json', import.meta.url), JSON.stringify(V2, null, 1));

// Building review spots for s1-tour: street level (camera on the nearest road, looking along it) and aerial, noon / night.
//   node tools/v2/buildings/spots.mjs [--places dt,brick] [--kinds st,air,stn,airn] > spots.json
const PLACES = {
  dt: [407, -110], brick: [0, 1760], sobe: [2398, 660], havana: [-660, -55], overtown: [0, -682], liberty: [-528, -1232],
  airport: [-1210, 1045], clew: [-1540, -2805], beach: [2332, -660], casino: [2183, -370],
};
const a = process.argv.slice(2), o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1];
const places = o.places ? o.places.split(',') : Object.keys(PLACES), kinds = o.kinds ? o.kinds.split(',') : ['st', 'air', 'airn'];
const street = (x, z, flip) => `const r = game.city.roadGraph.nearestEdge(${x}, ${z}, null, 400); if (r) { const p = r.point, d = r.dir, hw = r.edge.width / 2, sd = ${flip ? -1 : 1};
  const ex = p.x - d.z * (hw + 1.5) * sd, ez = p.z + d.x * (hw + 1.5) * sd, gy = game.city.groundHeightAt(ex, ez) || 0;
  game.teleport(ex - d.x * 30, undefined, ez - d.z * 30, Math.atan2(d.x, d.z));
  game.cameraOverride = (dt, cam) => { if (game.player && game.player.mesh) game.player.mesh.visible = false; cam.position.set(ex, gy + 1.75, ez); cam.lookAt(ex + d.x * 40 - d.z * 9 * sd, gy + 7, ez + d.z * 40 + d.x * 9 * sd); return true; }; }`;
const out = {}, WX = "try { game.weather && game.weather.set('clear', { instant: true }); game.weather && game.weather.hold && game.weather.hold(); } catch (e) {} ";
for (const p of places) { const [x, z] = PLACES[p];
  for (const k of kinds) {
    const tod = /n$/.test(k) ? 21.5 : 12;
    if (k.startsWith('st')) out[`${p}_${k}`] = { player: [x, z, 0], tod, eval: WX + street(x, z, k.includes('b')) };
    else out[`${p}_${k}`] = { player: [x, z, 0], tod, eval: WX + `game.cameraOverride = (dt, cam) => { cam.position.set(${x - 170}, 150, ${z + 190}); cam.lookAt(${x}, 10, ${z}); return true; };` };
  } }
console.log(JSON.stringify(out, null, 1));

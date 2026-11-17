// Shops pass review spots: street views of shops (11:00 / 21:00), a close-up through the glass, a downtown block.
//   node tools/v2/shops/mkspots.mjs > tools/v2/shops/spots.json
//   node tools/v2/s1-tour.mjs --set SH_after --spots tools/v2/shops/spots.json --settle 9000 [--q "&aprons=0&shops=0"]
// Each spot finds the storefront nearest (x, z) (DATA or synthetic), parks the player beside it and frames the shop front.
const SHOPS = {
  ftm_clothes: [-4891, -3954], ftm_rest: [-5116, -3778], ftm_pharm: [-5435, -3949], hia_clothes: [-150, -5251], cyp_clothes: [-1748, -6162], clew_salon: [-1518, -3388],
};
const cam = (X, Z, mode) => `
  const L = (game.city.storefrontsNear ? game.city.storefrontsNear(${X}, ${Z}, 80, []) : game.city.storefronts) || []; let f = null, bd = 1e9; for (const s of L) { const d = Math.hypot((s.fx ?? s.x) - ${X}, (s.fz ?? s.z) - ${Z}); if (d < bd) { bd = d; f = s; } }
  if (f) { const fx = f.fx ?? f.x, fz = f.fz ?? f.z, ox = Math.sin(f.facing || 0), oz = Math.cos(f.facing || 0), rx = -oz, rz = ox, gy = (x, z) => game.city.groundHeightAt(x, z) || 0, m = '${mode}';
    let eye, look; if (m === 'close') { eye = [fx + ox * 1.6 + rx * 1.4, 0, fz + oz * 1.6 + rz * 1.4]; eye[1] = gy(fx, fz) + 1.6; look = [fx - ox * 4 - rx * 0.5, gy(fx, fz) + 1.2, fz - oz * 4 - rz * 0.5]; }
    else if (m === 'wide') { eye = [fx + ox * 22 + rx * 14, 0, fz + oz * 22 + rz * 14]; eye[1] = gy(fx, fz) + 9; look = [fx, gy(fx, fz) + 2, fz]; }
    else { eye = [fx + ox * 10 + rx * 4.5, 0, fz + oz * 10 + rz * 4.5]; eye[1] = gy(fx, fz) + 1.7; look = [fx - rx * 0.6, gy(fx, fz) + 2.0, fz - rz * 0.6]; }
    game.teleport(fx + ox * 3.2 + rx * ((f.w || 6) / 2 + 2.5), undefined, fz + oz * 3.2 + rz * ((f.w || 6) / 2 + 2.5), 0);
    game.cameraOverride = (dt, c) => { c.position.fromArray(eye); c.lookAt(look[0], look[1], look[2]); return true; };
    window.__shop = { id: f.id, kind: f.kind, synth: !!f.synthetic, w: f.w, d: f.d, fx, fz, shellAwning: f.shellAwning }; }`;
const out = {};
for (const [k, [x, z]] of Object.entries(SHOPS)) { out[k + '_day'] = { player: [x, z, 0], tod: 11, eval: cam(x, z, 'street') }; out[k + '_night'] = { player: [x, z, 0], tod: 21, eval: cam(x, z, 'street') }; }
out.ftm_wide = { player: [-4891, -3954, 0], tod: 11, eval: cam(-4891, -3954, 'wide') };
out.ftm_close = { player: [-4891, -3954, 0], tod: 11, eval: cam(-4891, -3954, 'close') };
out.dt_block_day = { player: [407, -150, 0], tod: 11, eval: cam(407, -150, 'wide') };
out.dt_shop_day = { player: [407, -150, 0], tod: 11, eval: cam(407, -150, 'street') };
out.dt_shop_night = { player: [407, -150, 0], tod: 21, eval: cam(407, -150, 'street') };
console.log(JSON.stringify(out, null, 1));

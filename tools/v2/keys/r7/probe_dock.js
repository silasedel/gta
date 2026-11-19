// r7: rays down through the dock / deck / lawn (lot frame S): every collider surface hit, and where the player settles on the dock
(async () => { const NH = game.nicoHouse, T = game.THREE, R = game.RAPIER, sp = NH.spot, h = sp.streetHeading || 0, c = Math.cos(h), s = Math.sin(h), oz = NH.r4oz || 0, y0 = NH.group.position.y;
  const W = (x, z) => [sp.x + x * c + (z + oz) * s, sp.z - x * s + (z + oz) * c]; const out = { y0, rays: {} };
  const pts = { plat: [-3.7, -33], walk: [5, -30.6], deckS: [0, -2.5], lawn: [0, -20], under: [0, -6] };
  const site = NH.house.r4site; if (site) out.site = site;
  for (const [k, [x, z]] of Object.entries(pts)) { const [wx, wz] = W(x, z), hits = []; const ray = new R.Ray({ x: wx, y: y0 + 12, z: wz }, { x: 0, y: -1, z: 0 });
    game.world.intersectionsWithRay(ray, 30, true, (hh) => { hits.push(+(y0 + 12 - hh.toi - y0).toFixed(3)); return true; }); out.rays[k] = hits.sort((a, b) => b - a); }
  const [px, pz] = W(-3.7, -33); game.teleport(px, y0 + 2, pz, 0); await new Promise((r) => setTimeout(r, 2500));
  out.playerOnPlat = +(game.player.position.y - y0).toFixed(3); out.playerState = { grounded: game.player.state?.grounded, inWater: game.player.state?.inWater, swimming: game.player.state?.swimming };
  return JSON.stringify(out); })()

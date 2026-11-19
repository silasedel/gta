// Swim probe: drop the player into the canal from the wall top and walk him off the wall; float a skiff in the canal
(async () => {
  const NH = game.nicoHouse, T = game.THREE, c = game.city, sl = (ms) => new Promise((r) => setTimeout(r, ms));
  let fg = null;
  NH.group.traverse((o) => { if (o.name === 'r4_ext_site_h') fg = o; });
  const W = (x, z, y = 0) => new T.Vector3(x, y, z).applyMatrix4(fg.matrixWorld);
  const out = { canal: NH.house && game.nicoHouse_canal && game.nicoHouse_canal.stats };
  const mid = W(19.6, 4);
  out.query = { isW: c.isWater(mid.x, mid.z), g: +c.groundHeightAt(mid.x, mid.z).toFixed(2), sd: +c.seabedDepthAt(mid.x, mid.z).toFixed(2), sb: c.seabed?.heightAt?.(mid.x, mid.z) };
  game.teleport(mid.x, 1.5, mid.z, 0);
  await sl(3500);
  const P = game.player;
  out.drop = { y: +P.position.y.toFixed(2), swim: !!P.swimming, depth: +(P.waterDepth || 0).toFixed(2) };
  out.canalStats = game.nicoHouse_canal?.stats;
  // a skiff in the canal
  try {
    const p = W(19.6, -2);
    const b = game.boatSystem?.spawn?.('skiff', { x: p.x, z: p.z }, 0, { name: 'probe' });
    await sl(4000);
    const t = b?.body?.translation?.();
    out.boat = t ? { y: +t.y.toFixed(2), sea: c.seaLevel } : 'no boat';
  } catch (e) { out.boat = String(e); }
  // rays: what is under the canal now
  const R = game.RAPIER, Wd = game.world;
  out.rays = [];
  for (const [hx, hz] of [[13.0, 0], [19.6, 4], [26.2, 10], [19.6, -16], [19.6, 21.5]]) {
    const p = W(hx, hz);
    const h = Wd.castRay(new R.Ray({ x: p.x, y: 1.5, z: p.z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, undefined, P.collider || undefined);
    out.rays.push([hx, hz, h ? +(1.5 - h.timeOfImpact).toFixed(2) : null, h && h.collider.shape.type]);
  }
  return JSON.stringify(out);
})()

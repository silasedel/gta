// Canal probe: down rays and water queries along the canal's center line and across it (H frame -> world through r4_ext_site_h)
(() => {
  const NH = game.nicoHouse, T = game.THREE, R = game.RAPIER, W = game.world, c = game.city;
  let fg = null;
  NH.group.traverse((o) => { if (o.name === 'r4_ext_site_h') fg = o; });
  fg.updateMatrixWorld(true);
  const houseBody = new Set();
  const rows = [];
  const pts = [];
  for (const z of [-20, -16, -12, -5, 5, 15]) for (const x of [13.2, 15, 18.6, 22, 24]) pts.push([x, z]);
  for (const [hx, hz] of pts) {
    const p = new T.Vector3(hx, 0, hz).applyMatrix4(fg.matrixWorld);
    const hits = [];
    const skip = new Set();
    for (let k = 0; k < 5; k++) {
      const h = W.castRay(new R.Ray({ x: p.x, y: 30, z: p.z }, { x: 0, y: -1, z: 0 }), 60, true, undefined, undefined, undefined, undefined, (cc) => !skip.has(cc.handle));
      if (!h) break;
      const col = h.collider, hy = 30 - h.timeOfImpact, par = col.parent();
      hits.push([+hy.toFixed(2), par ? +par.handle.toFixed(0) : -1, col.shape.type]);
      skip.add(col.handle);
    }
    rows.push({ h: [hx, hz], isW: !!c.isWater(p.x, p.z), g: +(+c.groundHeightAt(p.x, p.z)).toFixed(2), sb: +(c.seabed?.heightAt?.(p.x, p.z) ?? NaN).toFixed(2), sd: +(+c.seabedDepthAt?.(p.x, p.z)).toFixed(2), hits });
  }
  return JSON.stringify({ sea: c.seaLevel, gy: +NH.group.position.y.toFixed(2), rows }, null, 0).replace(/\{"h"/g, '\n{"h"');
})()

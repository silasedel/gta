// Range: every gun fired at every surface panel and floor zone; counts impacts, penetrations and ricochets; screenshots.
const GUNS = [
  'pistol',
  'revolver',
  'microsmg',
  'smg',
  'rifle',
  'carbine',
  'shotgun',
  'sawnoff',
  'sniper',
];
const SURF = ['concrete', 'brick', 'wood', 'metal', 'glass', 'plastic', 'stucco'];
export async function run({ ev, shot, step, log }) {
  const res = await ev(`
    const g = T.game, out = {}, pens = {}; let cur = null;
    g.on('bulletImpact', (e) => { if (cur) (out[cur][e.material] = (out[cur][e.material] || 0) + 1); });
    g.on('penetrate', (e) => { if (cur) (pens[cur][e.material] = (pens[cur][e.material] || 0) + 1); });
    for (const k of ${JSON.stringify(GUNS)}) {
      cur = k; out[k] = {}; pens[k] = {}; T.select(k); T.step(2);
      ${JSON.stringify(SURF)}.forEach((m, i) => { const x = -9 + i * 3; T.lookAt(x * 0.6, 6, x + (Math.random() - 0.5) * 1.6, 0.9 + Math.random() * 1.2, 14); T.aim(true); T.step(3); for (let s = 0; s < 3; s++) { T.shot(); T.step(k === 'sniper' ? 80 : k === 'shotgun' ? 56 : 36); } });
      ['sand', 'dirt', 'grass', 'asphalt', 'wood', 'tile'].forEach((s, i) => { const x = -7.6 + i * 3; T.lookAt(x, 7, x, 0, 12); T.shot(); T.step(k === 'sniper' ? 80 : k === 'shotgun' ? 56 : 36); });
      T.lookAt(9, 9, 16, -0.12, 9); T.shot(); T.step(k === 'sniper' ? 80 : 40);
    }
    T.aim(false); T.step(5);
    return { out, pens, ric: T.count('ricochet'), fx: g.combat.gfx.stats, casings: g.combat.gfx.stats.casings };`);
  log('impactsPerGun', res.out);
  log('penetrations', res.pens);
  log('ricochets', res.ric);
  log('fx', res.fx);
  await ev(`T.cam(0, 2.2, 8.2, 0, 1.3, 14, 62); T.step(2);`);
  await shot('range_surfaces_wall.png');
  await ev(`T.cam(-9, 1.4, 12.2, -9, 1.3, 14, 50); T.step(2);`);
  await shot('range_impact_concrete.png');
  await ev(`T.cam(-3, 1.4, 12.2, -3, 1.3, 14, 50); T.step(2);`);
  await shot('range_impact_wood.png');
  await ev(`T.cam(0, 1.4, 12.2, 0, 1.3, 14, 50); T.step(2);`);
  await shot('range_impact_metal.png');
  await ev(`T.cam(3, 1.4, 12.2, 3, 1.3, 14, 50); T.step(2);`);
  await shot('range_impact_glass.png');
  await ev(`T.cam(0, 2.6, 15.4, 0, 1.2, 17, 70); T.step(2);`);
  await shot('range_backstop_exits.png');
  await ev(`T.cam(-1, 1.6, 9.6, -1, 0, 12, 60); T.step(2);`);
  await shot('range_floor_zones.png');
}

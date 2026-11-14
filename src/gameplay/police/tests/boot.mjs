import { run } from './lib.mjs';
await run('boot', async (t) => {
  const s = await t.ev(`JSON.stringify({ wanted: !!game.wanted?.law, police: !!game.police, units: game.police?.units.length, stations: game.police?.stations.list.map(s => s.name + ' @' + Math.round(s.x) + ',' + Math.round(s.z)), reality: game.wanted.reality().garments, failed: game.v2.failed, loaded: game.v2.loaded.length })`);
  console.log(s);
  t.ok(JSON.parse(s).wanted, 'knowledge-model facade installed');
  await t.ev(`game.emit('crime', { type: 'assault', position: game.player.position.clone() })`);
  await t.ev('__t.wait(1500)');
  console.log(JSON.stringify(await t.snap()));
});

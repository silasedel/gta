// SOUTHLINE V2 navigation: collect traffic-signal and stop-sign positions from the city tile data.
// The road graph itself only says where roads are; signals and stop signs are mapped props in the tiles. world-osm may
// later put them straight on the graph (node.signal / node.control), in which case this harvest finds nothing new and is harmless.

/**
 * @param data  game.miamiData (needs tileKeys + loadTile); anything else resolves to empty lists
 * @param slice optional async () => void, awaited every few tiles so the game never hitches
 * @returns {Promise<{signals:number[][], stops:number[][], crossings:number[][]}>}
 */
export async function harvestControls(data, slice = null) {
  const signals = [],
    stops = [],
    crossings = [];
  if (!data || !Array.isArray(data.tileKeys) || typeof data.loadTile !== 'function')
    return { signals, stops, crossings };
  let n = 0;
  for (const key of data.tileKeys) {
    let tile = null;
    try {
      tile = await data.loadTile(key);
    } catch (e) {
      tile = null;
    }
    if (tile && tile.props)
      for (const p of tile.props) {
        if (p.type === 'signal') signals.push([p.x, p.z]);
        else if (p.type === 'stop') stops.push([p.x, p.z]);
        else if (p.type === 'crossing') crossings.push([p.x, p.z]);
      }
    try {
      data.unloadTile?.(key);
    } catch (e) {
      /* */
    }
    if (slice && ++n % 6 === 0) await slice();
  }
  return { signals, stops, crossings };
}

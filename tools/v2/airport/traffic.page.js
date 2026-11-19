// Airports agent: watch the AI traffic for ~4 minutes (run by shots.mjs --js); returns each flight's phase timeline.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    T = game.airport.traffic,
    log = {};
  if (game.police) game.police.enabled = false;
  game.wanted?.clear?.('t');
  // speed the schedule up: an arrival now, the first departure soon
  const A = T.AP.find((a) => a.ap.id === 'mia');
  A.nextArr = 0;
  for (const f of T.flights)
    if (f.A === A && f.phase === 'parked') {
      f.depAt = Math.min(f.depAt, f.t + 5);
      break;
    }
  const t0 = performance.now();
  while (performance.now() - t0 < 240000) {
    for (const f of T.flights) {
      const k = f.id.code;
      const L = log[k] || (log[k] = []);
      if (L[L.length - 1]?.[1] !== f.phase)
        L.push([
          Math.round((performance.now() - t0) / 1000),
          f.phase,
          Math.round(f.x),
          Math.round(f.z),
          Math.round(f.y),
        ]);
    }
    await sleep(500);
  }
  return JSON.stringify({ log, rw: A.rwUser?.id?.code || null });
})();

// Airports agent: gameplay checks in the page (run by tools/v2/airport/shots.mjs --js). Returns a JSON string.
(async () => {
  const out = {},
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const A = game.airport.list.find((a) => a.state === 'live'),
    ap = A.ap,
    P = game.player;
  game.cameraOverride = null;
  game.wanted?.clear?.('test');
  if (game.police) game.police.enabled = true;
  // 1. climb: stand 0.6 m outside the fence at a straight span, facing it, press the climb
  const F = A.parts.fence;
  const ring = ap.airside,
    k = Math.floor(ring.length / 3),
    [ax, az] = ring[k],
    [bx, bz] = ring[k + 1];
  const mx = (ax + bx) / 2,
    mz = (az + bz) / 2,
    n = F.nearest(mx, mz, 30);
  out.fenceAt = n && { x: +n.x.toFixed(1), z: +n.z.toFixed(1), gate: n.gate };
  if (n) {
    const sx = n.x + n.nx * 0.7,
      sz = n.z + n.nz * 0.7,
      h = Math.atan2(-n.nx, -n.nz);
    game.teleport(sx, undefined, sz, h);
    await sleep(2500);
    P.heading = h;
    out.probe = !!game.airport.climb.probe();
    out.climbStarted = game.airport.climb.tryClimb();
    const phases = [];
    for (let i = 0; i < 16; i++) {
      await sleep(200);
      phases.push(game.airport.climb.phase);
    }
    await sleep(1500);
    const d = (P.position.x - n.x) * n.nx + (P.position.z - n.z) * n.nz;
    out.climb = {
      phases: [...new Set(phases)],
      sideAfter: +d.toFixed(2),
      inAirside: !!game.airport.inAirside(P.position.x, P.position.z),
    };
    await sleep(2500);
    out.wanted = {
      level: game.wanted?.level,
      history: (game.wanted?.law?.S?.history || []).slice(-3),
    };
  }
  game.wanted?.clear?.('test');
  if (game.police) game.police.enabled = false;
  // 2. traffic
  out.traffic = game.airport.traffic?.stats();
  return JSON.stringify(out);
})();

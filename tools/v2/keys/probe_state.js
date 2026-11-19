(() => {
  const NH = game.nicoHouse,
    h = NH.house;
  return JSON.stringify({
    dock: h.plan.dock,
    stats: {
      keysYard: h.stats.keysYard,
      keysDock: h.stats.keysDock,
      failed: h.stats.failed,
      parts: h.stats.parts,
    },
    parked: (NH.parked || []).map((v) => ({
      type: v.type || v.kind,
      pos: v.body?.translation?.() || v.position,
    })),
    spawnParked: typeof game.vehicles?.spawnParked,
    place: typeof game.vegetation?.place,
  });
})();

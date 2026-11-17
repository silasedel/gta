(() => {
  const NH = game.nicoHouse, g = NH.group, T = game.THREE, inv = new T.Matrix4().copy(g.matrixWorld).invert(), W = (lx, lz) => new T.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld);
  const L = (x, z) => { const v = new T.Vector3(x, 0, z).applyMatrix4(inv); return [+v.x.toFixed(1), +v.z.toFixed(1)]; };
  const out = { water: [], blds: [], lots: [], moorings: [], piers: [] };
  const R = 260, S = 4; for (let lz = -R; lz <= R; lz += S) { let row = ''; for (let lx = -R; lx <= R; lx += S) { const p = W(lx, lz); row += game.city.isWater(p.x, p.z) ? '~' : '.'; } out.water.push(row); }
  const D = game.miamiData, TS = game.city.streamer?.tileSize || 200, c = W(0, 0);
  for (let i = Math.floor((c.x - R) / TS); i <= Math.floor((c.x + R) / TS); i++) for (let j = Math.floor((c.z - R) / TS); j <= Math.floor((c.z + R) / TS); j++) {
    const t = D?.getTile?.(i, j); for (const b of (t?.buildings || [])) { const ring = b.rings?.[0]; if (!ring) continue; let sx = 0, sz = 0; for (const [x, z] of ring) { sx += x; sz += z; } const [lx, lz] = L(sx / ring.length, sz / ring.length); if (Math.abs(lx) < R && Math.abs(lz) < R) out.blds.push({ c: [lx, lz], style: b.style, h: b.h, area: Math.round(b.area || 0), claim: game.lots?.claims?.(b) }); }
    for (const p of (t?.piers || t?.docks || [])) out.piers.push(p.id ?? 1);
  }
  for (const l of (game.lots?.near?.(c.x, c.z, R) || [])) out.lots.push({ id: l.id, c: L(l.x, l.z), w: +l.w.toFixed(1), d: +l.d.toFixed(1), hd: +(l.heading - NH.spot.heading).toFixed(2), style: l.style, src: l.source });
  for (const m of (game.city.moorings?.(c.x, c.z, R) || [])) out.moorings.push({ c: L(m.x, m.z), kind: m.kind, len: m.length });
  out.tileKeys = D?.getTile ? Object.keys(D.getTile(Math.floor(c.x / TS), Math.floor(c.z / TS)) || {}) : null;
  return JSON.stringify(out);
})()

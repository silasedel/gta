// SOUTHLINE V2 navigation: route drawing helper for the minimap and the pause map (ui-frontend calls game.nav.draw).
// The canvas transform must already map world x -> canvas x and world z -> canvas y. Sizes are given in screen pixels and
// converted with opts.px (world meters per screen pixel), so the line keeps its weight at every zoom.

const COL = { free: '#2fe0d0', moderate: '#ffd27a', heavy: '#ff8a4c', jam: '#e23a4e', casing: 'rgba(6,18,24,.85)', walk: '#ffffff', boat: '#8fd8ff', air: '#ffd27a', leg: 'rgba(47,224,208,.38)', done: 'rgba(170,190,200,.35)' };
const LEVEL = [COL.free, COL.moderate, COL.heavy, COL.jam];

function trace(g, line, i0, i1, sx, sz) {
  g.beginPath();
  if (sx !== undefined) g.moveTo(sx, sz); else g.moveTo(line[2 * i0], line[2 * i0 + 1]);
  for (let i = sx !== undefined ? i0 : i0 + 1; i <= i1; i++) g.lineTo(line[2 * i], line[2 * i + 1]);
}

/**
 * opts: { px = 1, width = 5, prog?: { i, x, z } (draw only what is left), traffic?: TrafficModel, G?, legs?: [Route], stops?: [{x,z}],
 *         maneuvers = true, done = false (also draw the driven part, dimmed), alpha = 1 }
 */
export function drawRoute(g, route, opts = {}) {
  if (!route || !route.line || route.line.length < 4) return;
  const px = opts.px || 1, w = (opts.width || 5) * px, line = route.line, m = line.length >> 1;
  const prog = opts.prog && opts.prog.i >= 0 ? opts.prog : null;
  const i0 = prog ? Math.min(m - 2, prog.i) : 0;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = opts.alpha ?? 1;
  // later legs of a multi-stop trip
  if (opts.legs) for (const l of opts.legs) { if (!l || !l.line) continue; trace(g, l.line, 0, (l.line.length >> 1) - 1); g.strokeStyle = COL.casing; g.lineWidth = w + 2 * px; g.stroke(); g.strokeStyle = COL.leg; g.lineWidth = w * 0.8; g.stroke(); }
  if (opts.done && prog && prog.i > 0) { trace(g, line, 0, prog.i); g.lineTo(prog.x, prog.z); g.strokeStyle = COL.done; g.lineWidth = w * 0.7; g.stroke(); }
  // connectors from the real start / to the real destination (off the network)
  g.setLineDash([1.5 * px, 5 * px]); g.lineWidth = w * 0.45; g.strokeStyle = 'rgba(255,255,255,.8)';
  if (route.head && !prog) { g.beginPath(); g.moveTo(route.head[0][0], route.head[0][1]); g.lineTo(route.head[1][0], route.head[1][1]); g.stroke(); }
  if (route.tail) { g.beginPath(); g.moveTo(route.tail[0][0], route.tail[0][1]); g.lineTo(route.tail[1][0], route.tail[1][1]); g.stroke(); }
  g.setLineDash([]);
  const sx = prog ? prog.x : undefined, sz = prog ? prog.z : undefined;
  // casing
  trace(g, line, prog ? i0 + 1 : 0, m - 1, sx, sz);
  g.strokeStyle = COL.casing; g.lineWidth = w + 3 * px; g.stroke();
  if (route.mode === 'walk') { g.setLineDash([0.01, 2.1 * w]); g.strokeStyle = COL.walk; g.lineWidth = w * 0.95; g.stroke(); g.setLineDash([]); }
  else if (route.mode === 'boat' || route.mode === 'air') { g.strokeStyle = route.mode === 'boat' ? COL.boat : COL.air; g.lineWidth = w * 0.8; g.setLineDash([3 * w, 1.6 * w]); g.stroke(); g.setLineDash([]); }
  else {
    g.strokeStyle = COL.free; g.lineWidth = w; g.stroke();
    // congested stretches over the base line
    const T = opts.traffic, arcAt = route.arcAt, arcs = route.arcs;
    if (T && arcAt) {
      let a = 0; while (a < arcs.length - 1 && arcAt[a + 1] <= i0) a++;
      while (a < arcs.length) {
        const lv = T.level(arcs[a]);
        let b = a; while (b + 1 < arcs.length && T.level(arcs[b + 1]) === lv) b++;
        if (lv > 0) { const s0 = Math.max(arcAt[a], i0), s1 = Math.min(m - 1, arcAt[b + 1]); if (s1 > s0) { trace(g, line, s0, s1); g.strokeStyle = LEVEL[lv]; g.lineWidth = w; g.stroke(); } }
        a = b + 1;
      }
    }
    // light center line gives the direction of travel a little motion
    trace(g, line, prog ? i0 + 1 : 0, m - 1, sx, sz);
    g.setLineDash([2 * px, 9 * px]); g.lineDashOffset = -((typeof performance !== 'undefined' ? performance.now() : 0) / 70) * px;
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(px, w * 0.28); g.stroke(); g.setLineDash([]);
  }
  // maneuver arrows: the next few turns, drawn as a bent white arrow over the junction
  if (opts.maneuvers !== false && route.mode === 'drive' && px < 2.2) {
    const d0 = prog ? route.cum[i0] : 0; let shown = 0;
    for (const mv of route.maneuvers) {
      if (mv.type === 'depart' || mv.type === 'arrive' || mv.bearing === undefined || mv.bearingBefore === undefined) continue;
      const li = route.arcAt[Math.min(route.arcs.length, mv.arcIndex)]; if (route.cum[li] < d0 - 5) continue;
      if (++shown > 3) break;
      const L = Math.max(9, 14 * px);
      const ax = mv.x - Math.sin(mv.bearingBefore) * L, az = mv.z - Math.cos(mv.bearingBefore) * L, bx = mv.x + Math.sin(mv.bearing) * L, bz = mv.z + Math.cos(mv.bearing) * L;
      // snap the arrow onto the lane line near the junction
      const ox = line[2 * li] - mv.x, oz = line[2 * li + 1] - mv.z;
      g.beginPath(); g.moveTo(ax + ox, az + oz); g.quadraticCurveTo(mv.x + ox, mv.z + oz, bx + ox, bz + oz);
      g.strokeStyle = 'rgba(6,18,24,.9)'; g.lineWidth = w * 0.95 + 2 * px; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = w * 0.6; g.stroke();
      const hx = Math.sin(mv.bearing), hz = Math.cos(mv.bearing), hs = Math.max(4, 5.5 * px);
      g.beginPath(); g.moveTo(bx + ox + hx * hs * 1.3, bz + oz + hz * hs * 1.3); g.lineTo(bx + ox - hz * hs, bz + oz + hx * hs); g.lineTo(bx + ox + hz * hs, bz + oz - hx * hs); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = 'rgba(6,18,24,.9)'; g.lineWidth = px; g.stroke();
    }
  }
  // stops
  if (opts.stops && opts.stops.length > 1) {
    g.font = `800 ${9 * px}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    opts.stops.forEach((s, i) => { g.beginPath(); g.arc(s.x, s.z, 6.5 * px, 0, Math.PI * 2); g.fillStyle = i === 0 ? '#ff6b5a' : '#0b1a20'; g.fill(); g.lineWidth = 1.5 * px; g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = '#fff'; g.fillText(String(i + 1), s.x, s.z + 0.5 * px); });
  }
  g.restore();
}

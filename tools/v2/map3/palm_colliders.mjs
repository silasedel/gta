#!/usr/bin/env node
// Palm / tree collider truth check (W4, Nov 19 playtest: "palms colliding with things"). V2 test browser only.
//   node tools/v2/map3/palm_colliders.mjs --tag now [--at "0,1760;2398,660"] [--r 45] [--q "&foo=1"]
// At each spot: every drawn trunk (game.vegetation.trunksNear) gets 8 horizontal rays at 1.2 m over its base from 2.5 m out
// toward the drawn axis; the first static hit must be that trunk's capsule at the drawn bark radius (offset = hit - bark).
// Every static capsule / cylinder / ball within r whose axis is not on a drawn trunk is a phantom. Every drawn palm crown
// (model crown height .. top, model radius) is tested against non-trunk statics (buildings, roofs, awnings, decks).
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const TAG = o.tag || 'now',
  R = +(o.r || 45),
  SPOTS = String(o.at || '0,1760;2398,660;-400,-600')
    .split(';')
    .map((s) => s.split(',').map(Number));
const rep = { tag: TAG, spots: [] };
await withBrowser({ width: 960, height: 540, maxSeconds: +(o.max || 280) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute=1' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 200);
  await startGame(b);
  for (const [x, z] of SPOTS) {
    await b.eval(`(game.teleport(${x}, undefined, ${z}, 0), 1)`);
    await b
      .waitFor(
        `(() => { const st = game.city.streamer; return !game.teleportHolding && (!st || !st.readyAround || st.readyAround(${x}, ${z}, 150)); })()`,
        60,
      )
      .catch(() => {});
    await b.sleep(9000); // vegGround + trunk streamer settle
    const r = JSON.parse(
      await b.eval(`(() => { const Rp = game.RAPIER, W = game.world, ST = Rp.ShapeType, FL = Rp.QueryFilterFlags.EXCLUDE_DYNAMIC | Rp.QueryFilterFlags.EXCLUDE_KINEMATIC | Rp.QueryFilterFlags.EXCLUDE_SENSORS;
      const p = game.player.position, out = { at: [${x}, ${z}], flag: globalThis.__r2TrunkColliders, bodies: game.physics?.trunks?.count?.() ?? null, drawn: 0, rays: 0, rayMiss: 0, rayOther: 0, offs: [], badOff: [], phantoms: [], crowns: 0, crownHits: [] };
      const T = game.vegetation.trunksNear(p.x, p.z, ${R}), T2 = game.vegetation.trunksNear(p.x, p.z, ${R + 25}), lib = game.city?.flora?.models || {}; out.drawn = T.length;
      const trunkCol = (c) => { const t = c.shape?.type; return t === ST.Capsule || t === ST.Cylinder || t === ST.Ball; };
      const segD = (px, py, pz, s) => { const [x0, y0, z0, x1, y1, z1] = s, dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L2 = dx * dx + dy * dy + dz * dz || 1; let t = ((px - x0) * dx + (py - y0) * dy + (pz - z0) * dz) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x0 + dx * t - px, y0 + dy * t - py, z0 + dz * t - pz); };
      for (const e of T) { const s0 = e.segs[0], y = s0[1] + 1.2; let ax = s0[0], az = s0[2], rad = s0[6];
        for (const s of e.segs) if (y >= Math.min(s[1], s[4]) && y <= Math.max(s[1], s[4])) { const t = (y - s[1]) / ((s[4] - s[1]) || 1); ax = s[0] + (s[3] - s[0]) * t; az = s[2] + (s[5] - s[2]) * t; rad = s[6]; break; }
        for (let k = 0; k < 8; k++) { const an = k / 8 * Math.PI * 2, ox = ax + Math.cos(an) * 2.5, oz = az + Math.sin(an) * 2.5; out.rays++;
          let h = null; try { h = W.castRay(new Rp.Ray({ x: ox, y, z: oz }, { x: -Math.cos(an), y: 0, z: -Math.sin(an) }), 2.5, true, FL); } catch (er) { h = null; }
          if (!h) { out.rayMiss++; continue; } const d = h.timeOfImpact ?? h.toi, off = (2.5 - d) - rad;
          if (!trunkCol(h.collider)) { if (2.5 - d < rad + 0.6) { out.rayOther++; if (out.badOff.length < 10) out.badOff.push({ kind: e.kind, x: +ax.toFixed(1), z: +az.toFixed(1), off: +off.toFixed(2), shape: h.collider.shape?.type, why: 'nonTrunkHit' }); } continue; }
          out.offs.push(+off.toFixed(3)); if (Math.abs(off) > 0.12 && out.badOff.length < 10) out.badOff.push({ kind: e.kind, x: +ax.toFixed(1), z: +az.toFixed(1), off: +off.toFixed(2) }); } }
      W.forEachCollider((c) => { if (!trunkCol(c) || c.isSensor()) return; const pb = c.parent?.(); if (pb && !pb.isFixed?.()) return; const t = c.translation(); if ((t.x - p.x) ** 2 + (t.z - p.z) ** 2 > ${R * R}) return;
        let best = 9; for (const e of T2) for (const s of e.segs) best = Math.min(best, segD(t.x, t.y, t.z, s)); const tag = pb?.userData?.tag || null;
        if (best > 0.35 && /trunk/.test(tag || 'trunk')) { if (out.phantoms.length < 20) out.phantoms.push({ x: +t.x.toFixed(1), y: +t.y.toFixed(1), z: +t.z.toFixed(1), shape: c.shape?.type, tag, near: +best.toFixed(2) }); out.nPhantom = (out.nPhantom || 0) + 1; } });
      // crowns vs structures
      for (const e of T) { if (!e.palm) continue; const md = lib[e.kind]; if (!md) continue; out.crowns++; const sl = e.segs[e.segs.length - 1], sc = Math.hypot(1, 0) * 1; const top = sl[4], cr = (md.radius || 3) * (e.segs[0][6] / (md.trunkR || e.segs[0][6] || 1)) * 0.7;
        const cx = sl[3], cz = sl[5]; let hit = null;
        for (const [dx, dz] of [[0, 0], [cr, 0], [-cr, 0], [0, cr], [0, -cr]]) { const y0 = top + 1.2, len = 2.6; const L = []; try { W.intersectionsWithRay(new Rp.Ray({ x: cx + dx, y: y0, z: cz + dz }, { x: 0, y: -1, z: 0 }), len, false, (h) => { if (!trunkCol(h.collider)) L.push(+(y0 - h.timeOfImpact).toFixed(2)); return true; }, FL); } catch (er) { /* */ } if (L.length) { hit = { dx, dz, y: L[0] }; break; } }
        if (hit) { out.crownHits.push({ kind: e.kind, x: +cx.toFixed(1), z: +cz.toFixed(1), top: +top.toFixed(1), cr: +cr.toFixed(1), hit }); } }
      const gs = game.vegetation?.ground?.stats || game.vegGround?.stats; out.vg = gs ? { checked: gs.checked, dropped: gs.dropped, msMax: +gs.msMax.toFixed(2), msAvg: +(gs.msSum / Math.max(1, gs.frames)).toFixed(3) } : null;
      out.offMean = out.offs.length ? +(out.offs.reduce((a, b) => a + b, 0) / out.offs.length).toFixed(3) : null; out.offMax = out.offs.length ? Math.max(...out.offs.map(Math.abs)) : null; delete out.offs;
      return JSON.stringify(out); })()`),
    );
    console.log(JSON.stringify(r));
    rep.spots.push(r);
    const f = `docs/v2/shots/palm-colliders/${TAG}_${x}_${z}.jpg`;
    fs.mkdirSync('docs/v2/shots/palm-colliders', { recursive: true });
    await b.screenshot(f);
  }
  rep.errors = [...new Set(b.errors)].slice(0, 8);
});
fs.writeFileSync(`docs/v2/reports/palm-colliders-${TAG}.json`, JSON.stringify(rep, null, 1));
process.exit(0);

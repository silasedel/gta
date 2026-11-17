#!/usr/bin/env node
// Street furniture audit (stage 1 jobs 4-5): placement checks against the road / junction geometry, close-up shots
// (day + night) and draw calls / frame time at three places. Muted, headless, real gameplay start.
//   node tools/v2/furniture-audit.mjs --set after [--only shots,check,perf] [--views a,b] [--repick] [--q "&x=1"]
// Picks are cached in docs/v2/reports/furniture-picks.json so before / after shoot the same spots.
// Shots: docs/v2/shots/stage1/furniture/<set>_<view>.png; sheet docs/v2/shots/stage1/FURNITURE_<set>.png
// Report: docs/v2/reports/furniture-audit-<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from './browser.mjs';

const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'after';
const DIR = path.resolve('docs/v2/shots/stage1/furniture'); fs.mkdirSync(DIR, { recursive: true });
const PICKS = path.resolve('docs/v2/reports/furniture-picks.json');
const only = new Set(String(o.only || 'shots,check,perf').split(','));
const rep = { set: SET, when: new Date().toISOString(), shots: {}, check: {}, perf: {} };

// ---------- in-page helpers ----------
// placement check around (x0, z0): every furniture item of the built near tiles (+ regulatory signs) against the road graph
// (carriageway gap), the junction records (curb ramps / crosswalk landings), the ground height (floating / sunk)
const CHECK_JS = `((x0, z0) => {
  const C = game.city, G = C.roadGraph, R = 260, out = { kinds: {}, bad: [] };
  const KINDS = { lamp: 0.15, mast: 0.18, sigPole: 0.18, pedPost: 0.08, hydrant: 0.17, bin: 0.3, bench: 0.45, shelter: 0.8, signPost: 0.06, upole: 0.15, meter: 0.1, mailbox: 0.2, cabinet: 0.4, regSign: 0.05 };
  const items = [];
  game.scene.traverse((g) => { const P = g.userData?.tile?.props; if (!P || !g.name.startsWith('tile-near')) return; for (const k in KINDS) for (const p of P[k] || []) if ((p.x - x0) ** 2 + (p.z - z0) ** 2 < R * R && !p.elev) items.push([k, p]); });
  for (const s of (game.regSigns?.list?.(x0, z0, R) || [])) items.push(['regSign', { x: s.x, z: s.z, y: s.y }]);
  const nodes = G.nodes.filter((n) => (n.x - x0) ** 2 + (n.z - z0) ** 2 < (R + 60) ** 2).map((n) => C.junctionOf(n.id)).filter(Boolean);
  const pip = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const segD = (P, x, z) => { let d = 1e9; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const ax = P[j][0], az = P[j][1], bx = P[i][0], bz = P[i][1], vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1))); d = Math.min(d, Math.hypot(ax + vx * t - x, az + vz * t - z)); } return d; };
  const ne = {};
  // drawn ground: raycast down onto the near tiles' static meshes (sidewalk slabs, roads, land), not the data height field
  const ground = []; game.scene.traverse((g) => { if (!g.name.startsWith('tile-near')) return; g.traverse((m) => { if (m.isMesh && !m.isInstancedMesh && m.name !== 'signal-blades' && !/facade|shop|glass|roof/i.test(m.name)) ground.push(m); }); });
  const T = game.THREE, rc = new T.Raycaster(), o3 = new T.Vector3(), dn = new T.Vector3(0, -1, 0); rc.far = 2.4;
  const drawnY = (x, z, y0) => { rc.set(o3.set(x, y0 + 1.0, z), dn); const h = rc.intersectObjects(ground, false)[0]; return h ? h.point.y : NaN; };
  for (const [k, p] of items) {
    const t = (out.kinds[k] ||= { n: 0, inRoad: 0, ramp: 0, crosswalk: 0, float: 0, sunk: 0, gapMin: 99, gapSum: 0 }); t.n++;
    const r = KINDS[k] * (p.s || 1), bad = [];
    const e = G.nearestEdge ? G.nearestEdge(p.x, p.z, ne, 40) : null; const gap = e ? e.dist - e.edge.width / 2 - r : 99;
    if (e && !e.edge.elevated && !e.edge.bridge && gap < 0.2) bad.push('inRoad ' + gap.toFixed(2));
    t.gapMin = Math.min(t.gapMin, +gap.toFixed(2)); t.gapSum += Math.min(gap, 10);
    for (const J of nodes) { if ((J.node.x - p.x) ** 2 + (J.node.z - p.z) ** 2 > 3600) continue;
      if (pip(J.poly, p.x, p.z) || segD(J.poly, p.x, p.z) < r + 0.1 && pip(J.poly, p.x, p.z)) bad.push('inJunction');
      for (const L of J.legs) for (const rp of L.ramps || []) if (pip(rp.cut, p.x, p.z) || segD(rp.cut, p.x, p.z) < r + 0.25) bad.push('ramp');
      for (const L of J.legs) if (L.cw) { const dx = p.x - J.node.x, dz = p.z - J.node.z, s = dx * L.dx + dz * L.dz, lat = Math.abs(-dx * L.dz + dz * L.dx); if (s > L.cw[0] - 0.15 - r && s < L.cw[1] + 0.15 + r && lat < L.hw + 1.6) bad.push('crosswalk'); } }
    const gh = drawnY(p.x, p.z, p.y || 0), y = (p.y || 0) - (k === 'regSign' ? 0.12 : 0); // regulatory posts are drawn 12 cm into the ground // height of the surface really drawn under the item (raycast)
    if (Number.isFinite(gh) && gh < 1.5 && y < 1.5) { if (y - gh > 0.06) bad.push('float ' + (y - gh).toFixed(2)); if (gh - y > (/lamp|Pole|Post|upole|regSign|mast/.test(k) ? 0.3 : 0.06)) bad.push('sunk ' + (gh - y).toFixed(2)); } // poles / posts may be set into the ground
    for (const b of new Set(bad.map((s) => s.split(' ')[0]))) { const key = b === 'inJunction' ? 'inRoad' : b; t[key] = (t[key] || 0) + 1; }
    if (bad.length && out.bad.length < 60) out.bad.push([k, +p.x.toFixed(1), +p.z.toFixed(1), [...new Set(bad)].join(',')]);
  }
  for (const k in out.kinds) { const t = out.kinds[k]; t.gapAvg = +(t.gapSum / t.n).toFixed(2); delete t.gapSum; }
  return JSON.stringify(out);
})`;

const PICK_JS = `(() => {
  const G = game.city.roadGraph, C = game.city, out = {};
  const near = (x, z, r, f) => { let best = null, bd = 1e18; for (const n of G.nodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d > r * r || !f(n)) continue; const J = C.junctionOf(n.id); if (!J) continue; const sc = d - (J.legs.length >= 4 ? 4e4 : 0); if (sc < bd) { bd = sc; best = { id: n.id, x: n.x, z: n.z, deg: J.legs.length, signal: !!n.signal, legs: J.legs.map((l) => ({ dx: l.dx, dz: l.dz, hw: l.hw, D: l.D, kind: l.kind, sw: l.sw })) }; } } return best; };
  out.downtown = near(407, -110, 900, (n) => n.signal);
  out.town = near(-1540, -2805, 900, (n) => n.signal) || near(-1540, -2805, 900, () => true);
  out.townStop = near(-1540, -2805, 900, (n) => !n.signal);
  out.keys = near(-836, 5272, 600, (n) => !n.signal && (n.edges || []).every((k) => !/primary|trunk|motorway/.test(G.edges[k]?.kind || '')));
  out.keysSig = near(-836, 5272, 900, (n) => n.signal);
  out.beach = near(2332, -660, 900, (n) => n.signal);
  return JSON.stringify(out);
})()`;

// camera views from a junction pick: driver on the widest approach, pedestrian on a corner, a high 3/4 overview
function views(p) {
  const L = p.legs.slice().sort((x, y) => y.hw - x.hw)[0], d = 34 + L.D;
  const rx = -L.dz, rz = L.dx; // frame normal: inbound traffic on side -1
  const ex = p.x + L.dx * d - rx * Math.min(L.hw * 0.5, 4), ez = p.z + L.dz * d - rz * Math.min(L.hw * 0.5, 4);
  const L2 = p.legs[(p.legs.indexOf(L) + 1) % p.legs.length];
  const cx = (L.dx + L2.dx), cz = (L.dz + L2.dz), cl = Math.hypot(cx, cz) || 1, cr = Math.max(L.hw, L2.hw) + 4.5;
  return {
    drive: { eye: [ex, 1.6, ez], look: [p.x - L.dx * 6, 3.2, p.z - L.dz * 6] },
    corner: { eye: [p.x + cx / cl * cr, 1.7, p.z + cz / cl * cr], look: [p.x - cx / cl * 6, 2.6, p.z - cz / cl * 6] },
    high: { eye: [p.x + L.dx * 26 + rx * 22, 17, p.z + L.dz * 26 + rz * 22], look: [p.x, 1, p.z] },
  };
}

await withBrowser({ width: 1920, height: 1080, maxSeconds: +(o.max || 1500) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  if (!(await startGame(b))) console.log('WARN: title did not close');
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(); } catch (e) {} return 1; })()`);
  let picks = !o.repick && fs.existsSync(PICKS) ? JSON.parse(fs.readFileSync(PICKS, 'utf8')) : null;
  if (!picks) { picks = JSON.parse(await b.eval(PICK_JS)); fs.writeFileSync(PICKS, JSON.stringify(picks, null, 1)); }
  console.log('picks', Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, v && [v.id, Math.round(v.x), Math.round(v.z), v.deg, v.signal]])));
  // another helper's file save hot-reloads the page: wait for the game again and leave the title screen
  const live = async () => { if (await b.eval("!!(window.game && game.ready && typeof game.teleport === 'function' && !(game.ui && game.ui.title))").catch(() => false)) return;
    console.log('page reloaded: restarting the game'); await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480); await startGame(b);
    await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(); } catch (e) {} return 1; })()`); };
  const settle = async (x, z, secs = 60, again = true) => {
    await live();
    if (again) { await settle(x, z, secs, false); const nt = await b.eval("(() => { let n = 0; game.scene.traverse((g) => { if (g.name && g.name.startsWith('tile-near') && g.userData?.tile?.props) n++; }); return n; })()").catch(() => 0);
      if (nt > 0) return; console.log('no near tiles after settle: reloading the page'); await b.goto('http://127.0.0.1:5200/?mute' + (o.q || '')); await live(); return settle(x, z, secs, false); }
    await b.eval(`(() => { game.cameraOverride = null; game.teleport(${x}, undefined, ${z}); return 1; })()`);
    await b.sleep(4000);
    for (let i = 0; i < secs; i++) { const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)'); if (q < 2) break; await b.sleep(1000); }
    await b.sleep(1500);
  };
  const cam = (v) => b.eval(`(() => { const v = ${JSON.stringify(v)}; game.cameraOverride = (dt, c) => { c.position.fromArray(v.eye); c.lookAt(v.look[0], v.look[1], v.look[2]); if (v.fov && c.fov !== v.fov) { c.fov = v.fov; c.updateProjectionMatrix(); } return true; }; return 1; })()`);
  const frame = () => b.eval(`new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 2500) requestAnimationFrame(f); else { ts.sort((x, y) => x - y); const avg = ts.reduce((p, c) => p + c, 0) / ts.length; const ri = game.renderer.info.render; res(JSON.stringify({ avgMs: +avg.toFixed(2), medMs: +ts[ts.length >> 1].toFixed(2), calls: ri.calls, tris: ri.triangles, cpu: +(game.perf?.workAvg || 0).toFixed(2) })); } }; requestAnimationFrame(f); })`).then(JSON.parse);
  const shot = async (id, v, tod) => {
    await live();
    await b.eval(`(() => { game.timeOfDay = ${tod}; try { game.wanted?.clear?.('audit'); } catch (e) {} return 1; })()`); await cam(v); await b.sleep(2500);
    const f = path.join(DIR, `${SET}_${id}.png`); await b.screenshot(f); rep.shots[id] = { file: f, ...(await frame()) }; console.log('shot', id, JSON.stringify(rep.shots[id]));
  };

  // ---------- shots ----------
  if (only.has('shots')) {
    const want = o.views ? new Set(String(o.views).split(',')) : null;
    const W = (id) => !want || want.has(id);
    for (const [key, tag] of [['downtown', 'dt'], ['town', 'town'], ['keys', 'keys'], ['beach', 'beach']]) {
      const p = picks[key]; if (!p) continue;
      const V = views(p), ids = Object.keys(V).map((k) => tag + '_' + k).concat(tag === 'dt' ? ['dt_night', 'dt_nightcorner'] : []);
      if (!ids.some(W)) continue;
      await settle(p.x, p.z);
      for (const [k, v] of Object.entries(V)) if (W(tag + '_' + k)) await shot(tag + '_' + k, v, 13);
      if (tag === 'dt' && W('dt_night')) await shot('dt_night', V.drive, 22);
      if (tag === 'dt' && W('dt_nightcorner')) await shot('dt_nightcorner', V.high, 22.5);
      if (tag === 'keys' && W('keys_street')) { // along the nearest lane, eye height
        const v = JSON.parse(await b.eval(`(() => { const p = ${JSON.stringify(p)}; const L = p.legs[0], d = L.D + 30; return JSON.stringify({ eye: [p.x + L.dx * d + L.dz * 2, 1.7, p.z + L.dz * d - L.dx * 2], look: [p.x, 2, p.z] }); })()`));
        await shot('keys_street', v, 11);
      }
    }
    if (W('bus')) { // nearest bus shelter to Downtown / Brickell in the built near tiles
      await settle(picks.downtown.x, picks.downtown.z);
      const v = await b.eval(`(() => { let best = null, bd = 1e18; const px = game.player.position.x, pz = game.player.position.z;
        game.scene.traverse((g) => { const P = g.userData?.tile?.props; if (!P || !g.name.startsWith('tile-near')) return; for (const s of P.shelter || []) { const d = (s.x - px) ** 2 + (s.z - pz) ** 2; if (d < bd) { bd = d; best = s; } } });
        if (!best) return null; const fx = Math.sin(best.ry || 0), fz = Math.cos(best.ry || 0); return JSON.stringify({ eye: [best.x + fx * 9 + fz * 4, 1.7, best.z + fz * 9 - fx * 4], look: [best.x, 1.3, best.z], at: [best.x, best.z] }); })()`);
      if (v) { const V = JSON.parse(v); await settle(V.at[0], V.at[1], 40); await shot('bus', V, 12); }
    }
  }

  // ---------- detail close-ups: the nearest item of each furniture kind around a pick, eye height, 5-9 m away ----------
  if (only.has('detail')) {
    const KIND = String(o.kinds || 'sigPole,pedPost,cabinet,shelter,hydrant,bin,bench,meter,mailbox,upole,lamp,signPost').split(',');
    for (const [tag, p] of [['dt', picks.downtown], ['town', picks.town], ['keys', picks.keys]]) {
      if (!p) continue; await settle(p.x, p.z, 45);
      const V = JSON.parse(await b.eval(`(() => { const out = {}, KIND = ${JSON.stringify(KIND)}, px = ${p.x}, pz = ${p.z};
        const best = {}; game.scene.traverse((g) => { const P = g.userData?.tile?.props; if (!P || !g.name.startsWith('tile-near')) return; for (const k of KIND) for (const it of P[k] || []) { const d = (it.x - px) ** 2 + (it.z - pz) ** 2; if (d > 200 * 200) continue; if (!best[k] || d < best[k].d) best[k] = { d, it }; } });
        for (const k in best) { const it = best[k].it, ry = it.ry || 0, H = { sigPole: 4.2, upole: 5, lamp: 4.5, shelter: 1.3 }[k] || 0.9, D = { sigPole: 11, upole: 13, lamp: 10, shelter: 7.5 }[k] || 4.2;
          // view from the road side, 35 degrees off the facing direction
          const fx = Math.sin(ry), fz = Math.cos(ry), a = 0.6, vx = fx * Math.cos(a) - fz * Math.sin(a), vz = fz * Math.cos(a) + fx * Math.sin(a), sgn = k === 'sigPole' || k === 'pedPost' || k === 'upole' ? -1 : 1;
          out[k] = { eye: [it.x + vx * D * sgn, (it.y || 0) + 1.65, it.z + vz * D * sgn], look: [it.x, (it.y || 0) + H, it.z], at: [+it.x.toFixed(1), +it.z.toFixed(1)] }; }
        return JSON.stringify(out); })()`));
      for (const [k, v] of Object.entries(V)) { await shot(`${tag}_${k}`, v, 12); if (k === 'lamp' || k === 'sigPole' || k === 'pedPost') await shot(`${tag}_${k}Night`, v, 22); }
    }
    const files = Object.keys(rep.shots).filter((k) => /_(sigPole|pedPost|cabinet|shelter|hydrant|bin|bench|meter|mailbox|upole|lamp|signPost|lampNight|sigPoleNight|pedPostNight)$/.test(k)).map((k) => rep.shots[k].file);
    if (files.length) try { execFileSync('python3', ['tools/v2/montage.py', `docs/v2/shots/stage1/furniture/${SET}_details.png`, ...files, '--w', '480']); } catch (e) { /* */ }
  }

  // ---------- lit lamp vs traffic AI: the shader's state for every head == roadnet.signalState for its approach edge ----------
  if (only.has('sigmatch')) {
    await settle(picks.downtown.x, picks.downtown.z, 45);
    const r = JSON.parse(await b.eval(`(async () => { const { buildRoadNet, signalState } = await import('/src/vehicles/roadnet.js'); const net = buildRoadNet(game.city); net.game = game;
      const heads = []; game.scene.traverse((g) => { const P = g.userData?.tile?.props; if (P && g.name.startsWith('tile-near')) for (const h of P.sigHead || []) if (h.eid != null) heads.push(h); });
      const shader = (h, t) => { const k = ((t + h.sig[0] * 34) % 34 + 34) % 34, s = h.sig[1] < 0.5 ? k : (k + 17) % 34; return h.sig[2] < 0.5 ? 'flash' : s < 13 ? 'green' : s < 16 ? 'yellow' : 'red'; };
      let n = 0, ok = 0; const bad = [];
      for (let i = 0; i < 6; i++) { const t = performance.now() / 1000; for (const h of heads) { const e = net.edgeById.get(h.eid); if (!e) continue; const ai = signalState(net, h.nid, e) || 'none', sh = shader(h, t); n++; if (ai === sh) ok++; else if (bad.length < 12) bad.push([h.nid, h.eid, ai, sh]); } await new Promise((res) => setTimeout(res, 3100)); }
      return JSON.stringify({ heads: heads.length, samples: n, match: ok, bad }); })()`));
    rep.sigmatch = r; console.log('sigmatch', JSON.stringify(r));
  }

  // ---------- placement checks ----------
  if (only.has('check')) {
    const spots = [[picks.downtown.x, picks.downtown.z], [picks.town.x, picks.town.z], [picks.keys.x, picks.keys.z], [0, 1760], picks.beach ? [picks.beach.x, picks.beach.z] : [2332, -660], [-1320, 3190]];
    const tot = {};
    for (const [x, z] of spots) {
      await settle(x, z, 45);
      const r = JSON.parse(await b.eval(`(${CHECK_JS})(${x}, ${z})`));
      rep.check[`${Math.round(x)},${Math.round(z)}`] = r;
      for (const [k, v] of Object.entries(r.kinds)) { const t = (tot[k] ||= { n: 0, inRoad: 0, ramp: 0, crosswalk: 0, float: 0, sunk: 0, building: 0, junctionMissing: 0 }); for (const kk in v) if (typeof v[kk] === 'number') t[kk] = (t[kk] || 0) + v[kk]; }
      console.log('check', x, z, JSON.stringify(r.kinds), 'bad', JSON.stringify(r.bad.slice(0, 6)));
    }
    rep.checkTotal = tot; console.log('TOTAL', JSON.stringify(tot));
  }

  // ---------- performance ----------
  if (only.has('perf')) {
    for (const [id, x, z] of [['downtown', 407, -110], ['clewiston', -1540, -2805], ['keywest', -4895, 5940]]) {
      await settle(x, z, 60); await b.eval(`(() => { game.cameraOverride = null; game.timeOfDay = 12; return 1; })()`); await b.sleep(3000);
      const f1 = await frame(); await b.sleep(500); const f2 = await frame();
      rep.perf[id] = { a: f1, b: f2 }; console.log('perf', id, JSON.stringify(f1), JSON.stringify(f2));
    }
  }
  if (b.errors.length) { rep.errors = [...new Set(b.errors)].slice(0, 30); console.log('ERRORS', rep.errors.join('\n').slice(0, 3000)); }
});
fs.writeFileSync(`docs/v2/reports/furniture-audit-${SET}.json`, JSON.stringify(rep, null, 1));
if (only.has('shots')) {
  const order = ['dt_drive', 'dt_corner', 'dt_high', 'town_drive', 'town_corner', 'keys_street', 'bus', 'dt_night', 'dt_nightcorner'];
  const files = order.map((k) => rep.shots[k]?.file).filter(Boolean);
  if (files.length) try { execFileSync('python3', ['tools/v2/montage.py', `docs/v2/shots/stage1/FURNITURE_${SET}.png`, ...files, '--w', '640']); console.log('sheet', `docs/v2/shots/stage1/FURNITURE_${SET}.png`); } catch (e) { console.log('montage failed', e.message); }
}

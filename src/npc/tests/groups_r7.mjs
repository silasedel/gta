// r7-groups evidence: themed gatherings at the Keys street by Nico's house, footstep surface on the dock.
// node src/npc/tests/groups_r7.mjs [tag]
import fs from 'node:fs';
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';
const OUT = 'docs/v2/shots/people-groups', TAG = process.argv[2] || 'after';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const res = {};
const log = (k, v) => { res[k] = v; console.log(k, JSON.stringify(v).slice(0, 1200)); };
await withBrowser({ width: 1280, height: 720, maxSeconds: 420 }, async (b) => {
  const E = async (js) => {
    const s = await b.eval(`(async()=>{ try { return JSON.stringify(await (async()=>{ ${js} })()); } catch (e) { return JSON.stringify({ err: String(e && e.stack || e) }); } })()`);
    try { return JSON.parse(s); } catch (e) { return s; }
  };
  const shot = async (f) => { try { await b.screenshot(`${OUT}/${TAG}_${f}.png`); } catch (e) { console.log('shot failed', f); } };
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 150);
  await b.eval(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); 1`);
  await b.waitFor(GAME_READY, 150); await wait(2);
  const groupsJs = `const out = []; for (const g of game.peds.groups || []) { if (!g.talk) continue; out.push({ theme: g.theme, c: [Math.round(g.center.x), Math.round(g.center.z)], m: g.members.map((p) => { const m = p.char?.personMeta || {}; return [m.name, m.years, m.look, p.state, p.idleStyle, +p.pos.y.toFixed(2)]; }) }); } return { stats: game.peds.groupStats, groups: out };`;
  for (const [name, x, z, hr] of [['keys', -876, 4822, 11], ['downtown', -2505, 555, 13]]) {
    await E(`game.timeOfDay = ${hr}; game.teleport(${x}, null, ${z}, 0.4); return 1;`);
    await wait(25);
    // force a few groups on sidewalks 10-30 m away so we can look at them
    log(name + '_force', await E(`const N = game.peds._nav, pp = game.player.position, made = [];
      for (let i = 0; i < 12 && made.length < 3; i++) { const q = N.sidewalkNear(pp, 12 + i * 2); if (!q) continue; if (Math.hypot(q.x - pp.x, q.z - pp.z) < 7) continue; const r = game.peds._crowd({ x: q.x, y: N.groundAt(q.x, q.z, q.y || 0), z: q.z }, N.zoneAt(q.x, q.z), 3 + (i % 2)); if (r.length) made.push([Math.round(q.x), Math.round(q.z), r.length]); }
      return made;`));
    await wait(6);
    const g = await E(groupsJs); log(name + '_groups', g);
    log(name + '_solid', await E(`const N = game.peds._nav, pp = game.player.position, R = game.RAPIER, W = game.world, QF = R.QueryFilterFlags, out = [];
      for (let i = 0; i < 6; i++) { const q = N.sidewalkNear(pp, 60 + i * 8); if (!q) continue; const y = N.groundAt(q.x, q.z, q.y || 0);
        W.intersectionsWithShape({ x: q.x, y: y + 1.05, z: q.z }, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(0.32), (c) => { const t = c.translation(), sh = c.shape; out.push({ at: [+q.x.toFixed(1), +y.toFixed(2), +q.z.toFixed(1)], type: sh.type, he: sh.halfExtents ? [sh.halfExtents.x, sh.halfExtents.y, sh.halfExtents.z].map((n) => +n.toFixed(2)) : sh.radius, hh: sh.halfHeight, t: [+t.x.toFixed(1), +t.y.toFixed(2), +t.z.toFixed(1)], ud: c.parent()?.userData ? JSON.stringify(c.parent().userData).slice(0, 60) : null }); return out.length < 12; }, QF.EXCLUDE_DYNAMIC | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_SENSORS); }
      return out;`));
    // look at the nearest group: stand 5 m from it, facing it
    const aim = await E(`let best = null, bd = 1e9; const pp = game.player.position; for (const g of game.peds.groups || []) { if (!g.talk || g.members.length < 2) continue; const d = Math.hypot(g.center.x - pp.x, g.center.z - pp.z); if (d < bd) { bd = d; best = g; } }
      if (!best) return null; const h = Math.random() * 6.28; game.teleport(best.center.x + Math.sin(h) * 5.5, null, best.center.z + Math.cos(h) * 5.5, h + Math.PI); game.cameraYaw = h; return [best.theme, best.members.length];`);
    log(name + '_aim', aim);
    await wait(3); await shot(name + '_group');
    // jitter probe: y of standing group members over 2 s
    log(name + '_jitter', await E(`const ys = new Map(); for (let k = 0; k < 40; k++) { for (const p of game.peds.list) if (p.active && p.state === 'talk') { const a = ys.get(p) || []; a.push(p.root.position.y); ys.set(p, a); } await new Promise((r) => setTimeout(r, 50)); }
      let worst = 0; for (const a of ys.values()) { let mn = 1e9, mx = -1e9; for (const y of a) { mn = Math.min(mn, y); mx = Math.max(mx, y); } worst = Math.max(worst, mx - mn); } return { n: ys.size, worstRange: +worst.toFixed(3) };`));
  }
  // ---- footsteps on Nico's dock
  log('anchors', await E(`const H = game.nicoHouse, A = H?.anchors || {}; const out = {}; for (const k in A) { const v = A[k]; if (v && typeof v === 'object') { const p = v.isVector3 ? v : v.pos || v.position || v.p; if (p && Number.isFinite(p.x)) { const w = H.toWorld ? H.toWorld(p.clone ? p.clone() : p) : p; out[k] = [+w.x.toFixed(1), +(w.y ?? 0).toFixed(2), +w.z.toFixed(1)]; } else out[k] = Object.keys(v).slice(0, 6); } } return out;`));
  log('dockSteps', await E(`const H = game.nicoHouse, A = H?.anchors || {}; const k = Object.keys(A).find((q) => /dock/i.test(q)) || Object.keys(A).find((q) => /deck/i.test(q)); if (!k) return { none: Object.keys(A) };
    const v = A[k], p0 = v.isVector3 ? v : v.pos || v.position || v.p; const w = H.toWorld ? H.toWorld(p0.clone()) : p0;
    game.teleport(w.x + 1.5, (w.y ?? 0.5) + 0.1, w.z, -Math.PI / 2); await new Promise((r) => setTimeout(r, 2500));
    const P = game.player.position; const got = []; const off = game.on('footstep', (e) => got.push(e.surface));
    const kd = (t) => dispatchEvent(new KeyboardEvent(t, { code: 'KeyW', key: 'w' })); kd('keydown'); await new Promise((r) => setTimeout(r, 1500)); kd('keyup');
    return { anchor: k, pos: [+P.x.toFixed(1), +P.y.toFixed(2), +P.z.toFixed(1)], map: game.surfaceAt(P.x, P.z), foot: game.footSurfaceAt?.(P.x, P.y, P.z), src: game.footSurface?.stats, depth: game.player.waterDepth, steps: got };`));
  await shot('dock');
  log('groupStats', await E(`return { g: game.peds.groupStats, why: game.peds.clearWhy };`));
  fs.writeFileSync(`${OUT}/${TAG}_report.json`, JSON.stringify(res, null, 1));
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 10));
});

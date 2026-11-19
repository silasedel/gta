// get-up hand-off trace (PLAYER helper): per-frame bone jumps for the first 1.2 s of the get-up, to find pops
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const q = process.argv[2] || '';
await withBrowser({ width: 640, height: 360, maxSeconds: 200 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + q);
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 200);
  await startGame(b);
  await b.eval(`(() => { const H = game.nicoHouse, P = game.player; const e = game.city.roadGraph.nearestEdge(H.spot.x, H.spot.z, {}, 120); const d = e.dir;
    game.teleport(e.point.x + d.x * 10, undefined, e.point.z + d.z * 10, Math.atan2(d.x, d.z)); return 1; })()`);
  await b.sleep(2000);
  const r = await b.eval(`new Promise((res) => { const P = game.player, T = game.THREE, V = new T.Vector3(), prev = {}, out = []; let t0 = null;
    const c0 = game.playerCharacter; let snapRef = null, sv = null; Object.defineProperty(c0, '__snapPre', { get() { return sv; }, set(v) { sv = v; if (v) snapRef = v; }, configurable: true });
    const LA = c0.getBone('LeftArm'); const ou = c0.update; let qb = null; c0.update = (dt, a) => { qb = LA.quaternion.clone(); ou(dt, a); };
    game.playerRagdoll.trigger('test', { ragKind: 'car', vel: { x: Math.sin(P.heading) * 5, y: 1.6, z: Math.cos(P.heading) * 5 }, spin: 1.2, strength: 0.5, point: P.position.clone().setY(P.position.y + 0.9) });
    game.updaters.push((dt) => { const c = game.playerCharacter, ph = game.playerRagdoll.phase; if (ph === 'getup' && t0 === null) t0 = game.clock.elapsed; if (t0 === null) return;
      const t = game.clock.elapsed - t0; if (t > 1.3) { if (out) { res(JSON.stringify(out)); } return; }
      const row = [+t.toFixed(3), +dt.toFixed(3)]; for (const n of ['LeftHand', 'RightFoot', 'Head', 'Hips']) { c.getBone(n).getWorldPosition(V); row.push(prev[n] ? +V.distanceTo(prev[n]).toFixed(3) : 0); prev[n] = V.clone(); }
      let best = 0, bn = ''; c.model.traverse((o) => { if (!o.isBone) return; const pq = prev['q' + o.name]; if (pq) { const a = pq.angleTo(o.quaternion); if (a > best) { best = a; bn = o.name; } } prev['q' + o.name] = o.quaternion.clone(); });
      const e = snapRef && snapRef.find((x) => x.b === LA); row.push(bn, +best.toFixed(2), qb ? +qb.angleTo(LA.quaternion).toFixed(2) : null, e && e.aq ? +e.aq.angleTo(LA.quaternion).toFixed(2) : null, e ? +e.q.angleTo(LA.quaternion).toFixed(2) : null, e && e.aq ? +e.q.angleTo(e.aq).toFixed(2) : null, snapRef ? snapRef.length : 0, c.model.uuid.slice(0, 4), c0.model.uuid.slice(0, 4)); out.push(row); }); })`);
  console.log(r);
});

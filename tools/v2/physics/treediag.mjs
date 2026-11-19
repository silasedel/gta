// r2-physics: why can a tree at (x, z) be walked through? Reports the trunk-collider streamer state, the nearest trunksNear /
// countryside treesNear / tile P.tree entries, and what a ball at chest height touches there.
//   node tools/v2/physics/treediag.mjs --pts "-826.2,4822.7;-833.2,4856.4"
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const PTS = String(o.pts || '')
  .split(';')
  .filter(Boolean)
  .map((q) => q.split(',').map(Number));
await withBrowser({ width: 800, height: 450, maxSeconds: 1200 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  for (const [x, z] of PTS) {
    await b.eval(`(() => { game.teleport(${x} + 4, undefined, ${z} + 4); return 1; })()`);
    await b.sleep(7000);
    console.log(
      await b.eval(`JSON.stringify((() => { const V = game.vegetation, R = game.RAPIER, W = game.world, d = (p) => +Math.hypot(p[0] - ${x}, p[1] - ${z}).toFixed(2);
      let tn = []; try { tn = V?.trunksNear?.(${x}, ${z}, 6) || []; } catch (e) { tn = ['ERR ' + e.message]; }
      let cs = []; try { cs = V?.countryside?.treesNear?.(${x}, ${z}, 6) || []; } catch (e) { cs = ['ERR ' + e.message]; }
      let gy = 0; try { gy = game.city.groundHeightAt(${x}, ${z}); } catch (e) { /* */ }
      const touch = []; try { W.intersectionsWithShape({ x: ${x}, y: gy + 1.2, z: ${z} }, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(0.35), (c) => { const pb = c.parent(); touch.push({ shape: c.shapeType(), tag: pb?.userData?.tag || null }); return true; }); } catch (e) { touch.push('ERR'); }
      const veg = []; game.scene.traverse((m) => { if (!m.isInstancedMesh || !m.count) return; const ud = m.material?.userData || {}; const mm = new game.THREE.Matrix4(), v = new game.THREE.Vector3(); for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, mm); v.setFromMatrixPosition(mm).applyMatrix4(m.matrixWorld); if (Math.hypot(v.x - ${x}, v.z - ${z}) < 1.0) { veg.push({ name: m.name, vegKey: ud.vegKey || null, vegCls: ud.vegCls || null, veg: !!ud.veg, d: +Math.hypot(v.x - ${x}, v.z - ${z}).toFixed(2) }); break; } } });
      return { at: [${x}, ${z}], trunksOn: !!globalThis.__r2TrunkColliders, trunkBodies: game.physics?.trunks?.count?.(), shrubZones: game.physics?.shrubs?.count?.(), shrubCores: game.physics?.shrubs?.cores?.(), bushAt: +(game.city.bushAt?.(${x}, ${z}, 0) || 0).toFixed(2), pending: game.physics?.trunks?.pending?.(), hasTrunksNear: !!V?.trunksNear, hasCountryside: !!V?.countryside,
        trunksNear: tn.slice(0, 3).map((e) => typeof e === 'string' ? e : { kind: e.kind, d: d([e.segs[0][0], e.segs[0][2]]) }), csTrees: cs.slice(0, 3).map((e) => typeof e === 'string' ? e : { kind: e.kind, d: d([e.x, e.z]) }), touch, drawn: veg.slice(0, 4) }; })())`),
    );
    if (o.sprint) {
      // sprint from 4 m away straight through the point for 2.5 s: path speed and how far past it the player got
      await b.eval(
        `(() => { game.teleport(${x} - 4, undefined, ${z}, Math.PI / 2); window.__sp = []; window.__spI = setInterval(() => { const P = game.player.position; window.__sp.push([P.x, P.z, performance.now()]); }, 50); return 1; })()`,
      );
      await b.sleep(600);
      await b.key('KeyW', true, 'w');
      await b.key('ShiftLeft', true, 'Shift');
      await b.sleep(2500);
      await b.key('KeyW', false, 'w');
      await b.key('ShiftLeft', false, 'Shift');
      console.log(
        'sprint',
        await b.eval(`(() => { clearInterval(window.__spI); const S = window.__sp; let inside = [], outside = [];
        for (let i = 1; i < S.length; i++) { const v = Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]) / ((S[i][2] - S[i - 1][2]) / 1000); (game.city.bushAt(S[i][0], S[i][1], 0) > 0.2 ? inside : outside).push(v); }
        const avg = (a) => a.length ? +(a.reduce((p, q) => p + q, 0) / a.length).toFixed(2) : null; const L = S[S.length - 1];
        return JSON.stringify({ speedInside: avg(inside), speedOutside: avg(outside), endPastPoint: +(L[0] - ${x}).toFixed(2) }); })()`),
      );
    }
  }
});

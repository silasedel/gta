// r7-towels: sunbathers on towels at the beach, close shots + contact metrics.  node src/npc/tests/towels_r7.mjs [tag]
import fs from 'node:fs';
import { withBrowser, GAME_READY } from '../../../tools/v2/browser.mjs';
const OUT = 'docs/v2/shots/people-groups', TAG = process.argv[2] || 'after';
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
await withBrowser({ width: 1280, height: 720, maxSeconds: 330 }, async (b) => {
  const E = async (js) => { const s = await b.eval(`(async()=>{ try { return JSON.stringify(await (async()=>{ ${js} })()); } catch (e) { return JSON.stringify({ err: String(e && e.stack || e) }); } })()`); try { return JSON.parse(s); } catch (e) { return s; } };
  await b.goto('http://127.0.0.1:5200/?mute'); await b.waitFor(GAME_READY, 150);
  await b.eval(`dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' })); 1`); await b.waitFor(GAME_READY, 150); await wait(2);
  await E(`game.timeExternal = true; game.timeOfDay = 13; game.weather?.set?.('clear', { instant: true }); game.teleport(2332, undefined, -660, 0); return 1;`); await wait(15);
  console.log('sand', JSON.stringify(await E(`const pp = game.player.position; const q = game.peds._nav.sandPoint(pp, 300); if (!q) return null; game.teleport(q.x, undefined, q.z, 0); return [q.x, q.z];`)));
  await wait(10);
  const res = [];
  for (let i = 0; i < 3; i++) {
    const r = await E(`const N = game.peds._nav, pp = game.player.position; const c = { x: pp.x + 5, y: 0, z: pp.z, clone() { return { x: this.x, y: this.y, z: this.z }; } };
      c.y = N.groundAt(c.x, c.z, pp.y + 2); const ps = game.peds._sunbathers(c, 2) || []; await new Promise((r) => setTimeout(r, 4000));
      const p = ps.find((q) => q && q.towel && q.char); if (!p) return { none: ps.length };
      const t = p.towel; const ch = p.char; const out = { style: p.idleStyle, towelY: +t.position.y.toFixed(3), name: ch.personMeta?.name };
      const gy = N.groundAt(t.position.x, t.position.z, t.position.y + 1); out.towelOverGround = +(t.position.y - gy).toFixed(3);
      const bones = {}; for (const n of ['Hips', 'Spine2', 'Head', 'LeftFoot', 'RightFoot', 'LeftLeg']) { const bn = ch.getBone(n); if (!bn) continue; const v = bn.getWorldPosition(t.position.clone()); bones[n] = +(v.y - N.groundAt(v.x, v.z, v.y + 1)).toFixed(3); } out.boneOverSand = bones;
      // stand 3.2 m to the side of the towel, camera looking at it
      const h = t.rotation.y + Math.PI / 2, d = 3.4; game.teleport(t.position.x + Math.sin(h) * d, undefined, t.position.z + Math.cos(h) * d, h + Math.PI); game.cameraYaw = h; game.cameraPitch = 0.55;
      return out;`);
    console.log('towel', i, JSON.stringify(r)); res.push(r);
    await wait(2.5); await b.screenshot(`${OUT}/towel_${TAG}_${i}.png`);
    await E(`const pp = game.player.position; game.teleport(pp.x + 14, undefined, pp.z + 6, 0); return 1;`); await wait(3);
  }
  fs.writeFileSync(`${OUT}/towel_${TAG}.json`, JSON.stringify(res, null, 1));
  if (b.errors.length) console.log('ERR', b.errors.slice(0, 5));
});

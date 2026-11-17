#!/usr/bin/env node
// Hit-zone accuracy (PLAYER helper): shoots a dense grid of parallel rays (2.5 cm apart) at a character from the front
// and the side, and compares what the hit zones say (src/gameplay/hitZones.js rayLimbs) with what the visible skinned
// mesh says (three Raycaster on the posed mesh). Reports per view: rays that hit the body and the zones (good), body
// but no zone (a shot through the visible body that misses), zone but no body (a shot past the body that still hits).
// Runs on the player (Nico) and on the nearest few NPCs.
//   node tools/v2/player/hitcheck.mjs [--npcs 4] [--set h1]  -> docs/v2/reports/player-hitcheck-<set>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const SET = o.set || 'h';
const lim = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const CHECK = `(async () => {
  const T = game.THREE, HZ = await import('/src/gameplay/hitZones.js');
  const chars = [{ name: 'player', ch: game.playerCharacter }];
  const peds = (game.peds?.list || []).filter((p) => p.char && p.pos && !p.dead && p.char.getBone).sort((x, y) => x.pos.distanceTo(game.player.position) - y.pos.distanceTo(game.player.position)).slice(0, ${+(o.npcs || 4)});
  for (const p of peds) chars.push({ name: 'npc:' + (p.char.human?.id || p.char.npcArch || '?'), ch: p.char, person: !!p.char.human?.person });
  const out = [];
  for (const { name, ch, person } of chars) {
    ch.root.updateMatrixWorld(true);
    // the lowest-detail visible skinned mesh of the body (fast raycasts), all meshes if no LOD names
    const meshes = []; ch.root.traverse((m) => { if (m.isSkinnedMesh && m.geometry?.attributes?.position) meshes.push(m); });
    const lod = (n) => { const r = /LOD(\\d)/.exec(n.name); return r ? +r[1] : 0; };
    const maxL = Math.max(...meshes.map(lod)); const body = meshes.filter((m) => lod(m) === maxL && !/eye|lash|brow|teeth|tongue|Hair/i.test(m.name + ' ' + (m.material?.name || '')));
    const vis = body.map((m) => m.visible); body.forEach((m) => { m.visible = true; });
    const rc = new T.Raycaster(); const c = ch.root.position.clone();
    const h = ch.root.rotation.y, fwd = new T.Vector3(Math.sin(h), 0, Math.cos(h)), left = new T.Vector3(Math.cos(h), 0, -Math.sin(h));
    const res = {};
    for (const view of ['front', 'side']) {
      const dir = view === 'front' ? fwd.clone().negate() : left.clone().negate();
      const across = view === 'front' ? left : fwd;
      let both = 0, meshOnly = 0, zoneOnly = 0, n = 0; const zoneHits = {};
      for (let y = 0.05; y < 1.95; y += 0.025) for (let s = -0.5; s <= 0.5; s += 0.025) {
        const org = c.clone().addScaledVector(across, s).addScaledVector(dir, -3); org.y += y;
        rc.set(org, dir); rc.far = 6;
        const mh = rc.intersectObjects(body, false)[0];
        const zh = HZ.rayLimbs(org, dir, 6, [{ char: ch, pos: c }]);
        n++;
        if (mh && zh) { both++; zoneHits[zh.zone] = (zoneHits[zh.zone] || 0) + 1; } else if (mh) meshOnly++; else if (zh) zoneOnly++;
      }
      const bodyRays = both + meshOnly;
      res[view] = { rays: n, bodyRays, hitWhenAimedAtBody: +(both / Math.max(1, bodyRays)).toFixed(3), hitWhenAimedPastBody: zoneOnly, falseHitShare: +(zoneOnly / Math.max(1, both + zoneOnly)).toFixed(3), zones: zoneHits };
    }
    body.forEach((m, i) => { m.visible = vis[i]; });
    out.push({ name, person, meshes: body.length, ...res });
  }
  return JSON.stringify(out);
})()`;
await withBrowser({ width: 960, height: 540, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 400);
  await startGame(b);
  if (o.at) { const [x, z] = o.at.split(',').map(Number); await b.eval(`(() => { game.teleport(${x}, undefined, ${z}, 0); return 1; })()`); }
  await b.sleep(6000);
  const r = JSON.parse(await lim(b.eval(CHECK, 300000), 320000));
  for (const c of r) console.log(c.name, JSON.stringify({ front: c.front, side: c.side }));
  fs.mkdirSync('docs/v2/reports', { recursive: true });
  fs.writeFileSync(`docs/v2/reports/player-hitcheck-${SET}.json`, JSON.stringify(r, null, 2));
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 6).join('\n'));
});

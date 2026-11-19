#!/usr/bin/env node
// Hit-zone accuracy (PLAYER helper): shoots a dense grid of parallel rays (2.5 cm apart) at a character from the front
// and the side, and compares what the hit zones say (src/gameplay/hitZones.js rayLimbs) with what the visible skinned
// mesh says (three Raycaster on the posed mesh). Reports per view: rays that hit the body and the zones (good), body
// but no zone (a shot through the visible body that misses), zone but no body (a shot past the body that still hits).
// Runs on the player (Nico) and on the nearest few NPCs.
//   node tools/v2/player/hitcheck.mjs [--npcs 4] [--set h1]  -> docs/v2/reports/player-hitcheck-<set>.json
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'h';
const lim = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const CHECK = `(async () => {
  const T = game.THREE, HZ = await import('/src/gameplay/hitZones.js');
  const chars = [{ name: 'player', ch: game.playerCharacter }];
  const peds = (game.peds?.list || []).filter((p) => p.char && p.pos && !p.dead && p.char.getBone).sort((x, y) => x.pos.distanceTo(game.player.position) - y.pos.distanceTo(game.player.position)).slice(0, ${+(o.npcs || 4)});
  for (const p of peds) chars.push({ name: 'npc:' + (p.char.human?.id || p.char.npcArch || '?'), ch: p.char, person: !!p.char.human?.person });
  const out = [];
  for (const { name, ch, person } of chars) {
    ch.root.updateMatrixWorld(true);
    // the most detailed skinned body meshes (what the player sees up close), posed: bake world positions once, then
    // rasterize every triangle into the same 2.5 cm grid as the rays (a silhouette; exact, and fast without a BVH)
    const meshes = []; ch.root.traverse((m) => { if (m.isSkinnedMesh && m.geometry?.attributes?.position) meshes.push(m); });
    const lod = (n) => { const r = /LOD(\d)/.exec(n.name); return r ? +r[1] : 0; };
    const minL = Math.min(...meshes.map(lod)); const body = meshes.filter((m) => lod(m) === minL && !/eye|lash|brow|teeth|tongue|HairShell|HairCards/i.test(m.name + ' ' + (m.material?.name || '')));
    const vis = body.map((m) => m.visible);
    const c = ch.root.position.clone();
    const h = ch.root.rotation.y, fwd = new T.Vector3(Math.sin(h), 0, Math.cos(h)), left = new T.Vector3(Math.cos(h), 0, -Math.sin(h));
    const baked = body.map((m) => { const g = m.geometry, n = g.attributes.position.count, P = new Float32Array(n * 3), v = new T.Vector3();
      for (let i = 0; i < n; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
      return { P, idx: g.index ? g.index.array : null, n }; });
    const NS = 41, NY = 76, S0 = -0.5, Y0 = 0.05, ST = 0.025;
    const res = {};
    for (const view of ['front', 'side']) {
      const dir = view === 'front' ? fwd.clone().negate() : left.clone().negate();
      const across = view === 'front' ? left : fwd;
      const grid = new Uint8Array(NS * NY);
      for (const B of baked) {
        const P = B.P, I = B.idx, nt = I ? I.length / 3 : B.n / 3;
        const u = new Float32Array(B.n), w = new Float32Array(B.n);
        for (let i = 0; i < B.n; i++) { const dx = P[i * 3] - c.x, dz = P[i * 3 + 2] - c.z; u[i] = dx * across.x + dz * across.z; w[i] = P[i * 3 + 1] - c.y; }
        for (let t = 0; t < nt; t++) {
          const a0 = I ? I[t * 3] : t * 3, a1 = I ? I[t * 3 + 1] : t * 3 + 1, a2 = I ? I[t * 3 + 2] : t * 3 + 2;
          const x0 = u[a0], y0 = w[a0], x1 = u[a1], y1 = w[a1], x2 = u[a2], y2 = w[a2];
          const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(area) < 1e-12) continue;
          const i0 = Math.max(0, Math.ceil((Math.min(x0, x1, x2) - S0) / ST)), i1 = Math.min(NS - 1, Math.floor((Math.max(x0, x1, x2) - S0) / ST));
          const j0 = Math.max(0, Math.ceil((Math.min(y0, y1, y2) - Y0) / ST)), j1 = Math.min(NY - 1, Math.floor((Math.max(y0, y1, y2) - Y0) / ST));
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const px = S0 + i * ST, py = Y0 + j * ST;
            const e0 = (x1 - x0) * (py - y0) - (y1 - y0) * (px - x0), e1 = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1), e2 = (x0 - x2) * (py - y2) - (y0 - y2) * (px - x2);
            if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) grid[j * NS + i] = 1;
          }
        }
      }
      let both = 0, meshOnly = 0, zoneOnly = 0, n = 0, innerMiss = 0, airHit = 0; const zoneHits = {};
      for (let j = 0; j < NY; j++) for (let i = 0; i < NS; i++) {
        const org = c.clone().addScaledVector(across, S0 + i * ST).addScaledVector(dir, -3); org.y += Y0 + j * ST;
        const mh = grid[j * NS + i] === 1;
        const zh = HZ.rayLimbs(org, dir, 6, [{ char: ch, pos: c }]);
        n++;
        if (mh && zh) { both++; zoneHits[zh.zone] = (zoneHits[zh.zone] || 0) + 1; } else if (mh) meshOnly++; else if (zh) zoneOnly++;
        // away from the silhouette edge (all 8 neighbor cells agree): misses inside the body / hits in clear air
        let allM = true, noneM = true;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = j + dj, ii = i + di; const g = jj >= 0 && jj < NY && ii >= 0 && ii < NS ? grid[jj * NS + ii] : 0; if (g) noneM = false; else allM = false; }
        if (mh && !zh && allM) innerMiss++; if (zh && noneM) airHit++;
      }
      const bodyRays = both + meshOnly;
      res[view] = { rays: n, bodyRays, hitWhenAimedAtBody: +(both / Math.max(1, bodyRays)).toFixed(3), hitWhenAimedPastBody: zoneOnly, falseHitShare: +(zoneOnly / Math.max(1, both + zoneOnly)).toFixed(3), missInsideBody: innerMiss, hitsInClearAir: airHit, clearAirShare: +(airHit / Math.max(1, both + zoneOnly)).toFixed(3), zones: zoneHits };
    }
    out.push({ name, person, meshes: body.length, ...res });
  }
  return JSON.stringify(out);
})()`;
await withBrowser({ width: 960, height: 540, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 400);
  await startGame(b);
  if (o.at) {
    const [x, z] = o.at.split(',').map(Number);
    await b.eval(`(() => { game.teleport(${x}, undefined, ${z}, 0); return 1; })()`);
  }
  await b.sleep(6000);
  const r = JSON.parse(await lim(b.eval(CHECK, 300000), 320000));
  for (const c of r) console.log(c.name, JSON.stringify({ front: c.front, side: c.side }));
  fs.mkdirSync('docs/v2/reports', { recursive: true });
  fs.writeFileSync(`docs/v2/reports/player-hitcheck-${SET}.json`, JSON.stringify(r, null, 2));
  if (b.errors.length) console.log('ERRORS', [...new Set(b.errors)].slice(0, 6).join('\n'));
});

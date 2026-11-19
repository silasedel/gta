#!/usr/bin/env node
// Z-FIGHT DETECTOR CLI (render track, Nov 18). Boots the game, puts the camera at each view, runs window.__zf
// (tools/v2/render/zfight.page.js: ID render with depth-precision / tie-break variants) and writes
//   docs/v2/shots/render/zf_<tag>_<view>.png (flagged pixels magenta) + _shot.jpg, docs/v2/reports/zfight-<tag>.json
//   node tools/v2/render/zfight.mjs [--tag before] [--views house_front,deck_side,...] [--hour 11] [--q "&foo=1"]
// Views are in Nico's house local frame (house:) or world coordinates (world:). Add more in VIEWS below.
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const TAG = o.tag || 'run', D = 'docs/v2/shots/render', W = +(o.w || 1600), H = +(o.h || 900);
fs.mkdirSync(D, { recursive: true }); fs.mkdirSync('docs/v2/reports', { recursive: true });
// eye / target relative to the player spawn (sp), or in the house group frame (house)
const VIEWS = {
  spawn_fwd: { rel: 'player', eye: [0, 1.7, 0], look: 'fwd' },
  door: { rel: 'door', dist: 6, h: 0.3, side: 0 },
  door_l: { rel: 'door', dist: 5, h: 0.2, side: -4 },
  door_r: { rel: 'door', dist: 5, h: 0.2, side: 4 },
  house_front: { rel: 'house', eye: 'front', dist: 9, h: 2.0 },
  house_front_far: { rel: 'house', eye: 'front', dist: 22, h: 3.0 },
  house_left: { rel: 'house', eye: 'left', dist: 10, h: 3.0 },
  house_right: { rel: 'house', eye: 'right', dist: 10, h: 3.0 },
  house_back: { rel: 'house', eye: 'back', dist: 12, h: 3.5 },
  street: { rel: 'player', eye: [0, 8, 0], look: 'down45' },
};
const views = (o.views || Object.keys(VIEWS).join(',')).split(',');
const rep = { tag: TAG, views: {} };
const save = (p, url) => fs.writeFileSync(p, Buffer.from(url.split(',')[1], 'base64'));
await withBrowser({ width: W, height: H, maxSeconds: +(o.max || 900) }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 480);
  await startGame(b);
  await b.eval(`(() => { const t = document.getElementById('title'); if (t) t.style.display = 'none'; game.timeExternal = true; game.timeOfDay = ${+(o.hour || 11)}; game.lookAEInstant = true; const st = document.createElement('style'); st.textContent = '#ps-hud,#hud,#minimap,#radar,.ps-toast,[class*=toast],[class*=notif]{display:none!important}'; document.head.appendChild(st); return 1; })()`);
  await b.eval(fs.readFileSync('tools/v2/render/zfight.page.js', 'utf8'));
  await b.sleep(8000);
  for (const v of views) {
    const V = VIEWS[v]; if (!V) { console.log('unknown view', v); continue; }
    const placed = await b.eval(`(() => { const T = game.THREE, V = ${JSON.stringify(V)}; let E, L;
      if (V.rel === 'house') { const g = game.nicoHouse?.group; if (!g) return 'no house'; g.updateMatrixWorld(true);
        const bb = new T.Box3(); g.traverse((m) => { if (m.isMesh && m.name && /house|wall|siding|body/i.test(m.name)) bb.expandByObject(m); }); if (bb.isEmpty()) bb.setFromObject(g);
        const c = bb.getCenter(new T.Vector3()); const q = g.getWorldQuaternion(new T.Quaternion());
        const dir = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0] }[V.eye]; const d = new T.Vector3(...dir).applyQuaternion(q);
        const fy = game.nicoHouse.anchors?.door?.pos?.y ?? c.y; E = c.clone().addScaledVector(d, V.dist); E.y = fy + V.h; L = c.clone(); L.y = fy + 1.2; }
      else if (V.rel === 'door') { const A = game.nicoHouse?.anchors || {}; const dp = A.door?.pos || A.front?.pos; if (!dp) return 'no door';
        const c = new T.Box3().setFromObject(game.nicoHouse.group).getCenter(new T.Vector3()); const d = new T.Vector3(dp.x - c.x, 0, dp.z - c.z).normalize(); const sd = new T.Vector3(-d.z, 0, d.x);
        E = new T.Vector3(dp.x, dp.y + 1.6 + V.h, dp.z).addScaledVector(d, V.dist).addScaledVector(sd, V.side); L = new T.Vector3(dp.x, dp.y + 1.4, dp.z).addScaledVector(sd, V.side * 0.5); }
      else { const P = game.player.position; E = new T.Vector3(P.x + V.eye[0], P.y + V.eye[1], P.z + V.eye[2]); const h = game.player.heading || 0;
        L = V.look === 'down45' ? new T.Vector3(P.x + Math.sin(h) * 8, P.y, P.z + Math.cos(h) * 8) : new T.Vector3(P.x + Math.sin(h) * 20, P.y + 1.5, P.z + Math.cos(h) * 20); }
      window.__zfE = E.toArray(); window.__zfL = L.toArray();
      game.cameraOverride = (dt, c) => { c.position.fromArray(window.__zfE); c.lookAt(...window.__zfL); return true; }; return 'ok'; })()`);
    if (placed !== 'ok') { console.log(v, placed); continue; }
    for (let i = 0; i < 30; i++) { if ((await b.eval('(game.city?.streamer?.pending?.() ?? 0)')) < 3) break; await b.sleep(1000); }
    await b.sleep(2500);
    await b.screenshot(`${D}/zf_${TAG}_${v}_shot.jpg`, { format: 'jpeg', quality: 80 });
    const r = JSON.parse(await b.eval(`window.__zf({ scale: ${+(o.scale || 0.5)} }).then((x) => JSON.stringify(x))`));
    if (r.overlay) save(`${D}/zf_${TAG}_${v}.png`, r.overlay);
    delete r.overlay;
    rep.views[v] = r;
    console.log(`${v}: flagged ${r.flagged} px (${r.pct}%)`);
    for (const p of r.pairs.slice(0, 12)) console.log(`   ${String(p.px).padStart(6)}  ${p.a}  <->  ${p.b}  @${p.at}`);
  }
  if (b.errors.length) rep.errors = [...new Set(b.errors)].slice(0, 15);
});
fs.writeFileSync(`docs/v2/reports/zfight-${TAG}.json`, JSON.stringify(rep, null, 1));

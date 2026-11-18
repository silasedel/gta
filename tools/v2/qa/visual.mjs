#!/usr/bin/env node
// r2-qa visual sweep: ~18 fixed cameras across the map (12:30, two at dusk). Per camera: two still frames 10 frames apart
// (PNG, for shimmer / z-fight analysis), the float/sink audit around the spot, a scan for meshes with missing textures, and
// the console. Analysis + crops + contact sheet: tools/v2/qa/visual_analyze.py (run at the end).
//   node tools/v2/qa/visual.mjs [--only id,id]
// Output: docs/v2/shots/qa/visual/<id>_{a,b}.png, docs/v2/reports/qa-visual.json
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
const DIR = 'docs/v2/shots/qa/visual'; fs.mkdirSync(DIR, { recursive: true });
// kinds: house (Nico's house-local eye/look), world (eye/look), street (nearest road edge to at, or a named road), find (page expr -> {eye, look})
const SPOTS = [
  { id: 'r0b_deck', kind: 'house', eye: [-8.39, 4.65, 1.34], look: [-16.29, -2.64, 18.21], fov: 56 },
  { id: 'spawn', kind: 'find', expr: `(() => { const s = game.city.playerSpawn, h = game.city.playerSpawnHeading || 0; return { at: [s.x, s.z], eye: [s.x - Math.sin(h) * 5, (s.y || 0) + 2.1, s.z - Math.cos(h) * 5], look: [s.x + Math.sin(h) * 6, (s.y || 0) + 1.1, s.z + Math.cos(h) * 6] }; })()` },
  { id: 'keys_street', kind: 'street', at: [-873.6, 4825.2] },
  { id: 'keys_shore_air', kind: 'world', eye: [-878, 28, 4858], look: [-912, 0, 4826], fov: 55 },
  { id: 'card_sound_rd', kind: 'street', name: /card sound/i, at: [-760, 4876] },
  { id: 'glades_airboat', kind: 'find', expr: `(() => { const s = (game.boatSystem?.gladeSites || [])[0]; const x = s ? s.x : -4280, z = s ? s.z : 1040; const gy = game.city.groundHeightAt?.(x, z) || 0; return { at: [x, z], eye: [x + 14, gy + 3.2, z + 9], look: [x, gy + 0.8, z], site: !!s }; })()` },
  { id: 'homestead', kind: 'street', at: [-1320, 3190] },
  { id: 'little_havana', kind: 'street', name: /\b(sw )?8th st|calle ocho/i, at: [-660, -55] },
  { id: 'downtown', kind: 'street', at: [407, -110] },
  { id: 'brickell', kind: 'street', at: [0, 1760] },
  { id: 'ocean_drive', kind: 'street', name: /ocean d/i, at: [2398, 560] },
  { id: 'sobe_sand', kind: 'find', expr: `(() => { const C = game.city; let p = null; for (let dx = 0; dx < 600 && !p; dx += 10) { const x = 2398 + dx, z = 560; const s = (game.surfaceAt || C.surfaceAt)?.(x, z); if (/sand/.test(String(s)) && !(C.isWater && C.isWater(x, z))) p = [x + 25, z]; } if (!p) p = [2480, 560]; const gy = C.groundHeightAt?.(p[0], p[1]) || 0; return { at: p, eye: [p[0] - 6, gy + 1.7, p[1] - 3], look: [p[0] + 40, gy + 0.6, p[1] + 10] }; })()` },
  { id: 'mb_residential', kind: 'find', expr: `(() => { const C = game.city, D = game.miamiData; for (let r = 0; r < 4000; r += 100) for (let k = 0; k < 24; k++) { const x = 2400 + Math.cos(k / 24 * 6.283) * r, z = -400 + Math.sin(k / 24 * 6.283) * r; let d = '', zn = ''; try { d = C.districtAt?.(x, z) || ''; zn = D?.zoneAt?.(x, z) || ''; } catch (e) {} if (/miami beach|mid-beach|north beach|surfside/i.test(d) && /resid/.test(zn)) return { street: [x, z], district: d }; } return { street: [2332, -660] }; })()` },
  { id: 'airport_apron', kind: 'world', eye: [-1300, 6, 1140], look: [-1380, 8, 1075], fov: 60 },
  { id: 'hotel_lobby', kind: 'lobby', at: [2398, 660], re: 'hotel|motel' },
  { id: 'metro_platform', kind: 'metro' },
  { id: 'keys_street_dusk', kind: 'street', at: [-873.6, 4825.2], tod: 19.1 },
  { id: 'ocean_drive_dusk', kind: 'street', name: /ocean d/i, at: [2398, 560], tod: 19.4 },
];
const want = o.only ? new Set(String(o.only).split(',')) : null;
const rep = { when: new Date().toISOString(), spots: {}, console: [] };
const save = () => fs.writeFileSync('docs/v2/reports/qa-visual.json', JSON.stringify(rep, null, 1));
await withBrowser({ width: 1280, height: 720, maxSeconds: 2400 }, async (b) => {
  const con = new Map();
  b.on((m, p) => {
    let lvl, text, url;
    if (m === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) { lvl = p.type; text = (p.args || []).map((x) => x.value ?? x.description ?? '').join(' '); const f = p.stackTrace?.callFrames?.[0]; url = f ? `${f.url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]}:${f.lineNumber + 1}` : ''; }
    else if (m === 'Runtime.exceptionThrown') { lvl = 'exception'; const d = p.exceptionDetails; text = d.exception?.description || d.text; const f = d.stackTrace?.callFrames?.[0]; url = f ? `${f.url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0]}:${f.lineNumber + 1}` : ''; }
    else return;
    const k = lvl + '|' + String(text).slice(0, 160); const e = con.get(k); if (e) e.n++; else con.set(k, { lvl, text: String(text).slice(0, 300), url, n: 1, at: rep.cur || 'boot' });
  });
  const ev = async (e, ms) => { try { return await b.eval(e, ms); } catch (err) { console.log('EVAL FAIL', err.message.slice(0, 200)); return null; } };
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY + " && typeof game.teleport === 'function'", 600);
  await startGame(b);
  await b.eval(fs.readFileSync('tools/v2/qa/tourPage.js', 'utf8'));
  await ev(`(() => { game.timeExternal = true; game.timeOfDay = 12.5; try { game.weather?.set?.('clear', { instant: true }); game.weather?.hold?.(true); } catch (e) {} try { game.dev?.setOn?.(true); game.dev?.setPoliceLock?.(true); game.dev?.setOn?.(false); } catch (e) {}
    const st = document.createElement('style'); st.textContent = 'body > *:not(canvas):not(#app):not(#game) { visibility: hidden !important } canvas { visibility: visible !important }'; document.head.append(st); window.__hudCss = st; return 1; })()`);
  for (const S of SPOTS) {
    if (want && !want.has(S.id)) continue;
    rep.cur = S.id; const t0 = Date.now(); const R = rep.spots[S.id] = { kind: S.kind, tod: S.tod ?? 12.5 };
    try {
      let cam = null;
      if (S.kind === 'world') cam = { eye: S.eye, look: S.look, at: [S.eye[0], S.eye[2]] };
      else if (S.kind === 'house') cam = JSON.parse(await ev(`(() => { const NH = game.nicoHouse, V = game.THREE.Vector3; const e = NH.toWorld(new V(${S.eye})), l = NH.toWorld(new V(${S.look})); return JSON.stringify({ eye: [e.x, e.y, e.z], look: [l.x, l.y, l.z], at: [e.x, e.z] }); })()`));
      else if (S.kind === 'find') { cam = JSON.parse(await ev(`JSON.stringify(${S.expr})`)); if (cam.street) S._street = cam.street; }
      if (S.kind === 'street' || S._street) {
        const at = S._street || S.at;
        cam = JSON.parse(await ev(`(() => { const G = game.city.roadGraph; let e = null; ${S.name ? `{ const re = ${S.name}; let bd = 1e12; for (const ed of G.edges) { if (!re.test(ed.name || '')) continue; const p = ed.pts[Math.floor(ed.pts.length / 2)]; const d = Math.hypot(p[0] - ${at[0]}, p[1] - ${at[1]}); if (d < bd) { bd = d; e = ed; } } }` : ''}
          if (!e) e = G.nearestEdge(${at[0]}, ${at[1]}, {}, 600)?.edge; const p = e.pts, i = Math.max(0, Math.floor(p.length / 2) - 1), q = p[i], r = p[i + 1] || p[i - 1]; const dx = r[0] - q[0], dz = r[1] - q[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, off = (e.width || 7) / 2 + 1.6;
          const ex = q[0] - uz * off, ez = q[1] + ux * off, gy = game.city.groundHeightAt?.(ex, ez) || 0; return JSON.stringify({ eye: [ex, gy + 1.7, ez], look: [ex + ux * 30 + uz * 2, gy + 1.3, ez + uz * 30 - ux * 2], at: [q[0], q[1]], road: e.name || e.kind }); })()`));
      }
      if (S.kind === 'lobby') {
        cam = JSON.parse(await ev(`(() => { const L = game.city.storefronts || []; const re = new RegExp(${JSON.stringify(S.re)}); let f = null, bd = 1e12; for (const s of L) { if (!re.test(s.kind || '')) continue; const d = Math.hypot((s.fx ?? s.x) - ${S.at[0]}, (s.fz ?? s.z) - ${S.at[1]}); if (d < bd) { bd = d; f = s; } } if (!f) return 'null';
          const fx = f.fx ?? f.x, fz = f.fz ?? f.z, ox = Math.sin(f.facing || 0), oz = Math.cos(f.facing || 0), rx = -oz, rz = ox, gy = game.city.groundHeightAt(fx, fz) || 0; game.teleport(fx - ox * 1.2, undefined, fz - oz * 1.2, 0);
          return JSON.stringify({ eye: [fx - ox * 0.9 + rx * 0.6, gy + 1.65, fz - oz * 0.9 + rz * 0.6], look: [fx - ox * 8, gy + 1.0, fz - oz * 8], at: [fx, fz], name: f.name, interior: true }); })()`));
        await b.sleep(14000);
      }
      if (S.kind === 'metro') {
        await ev(`(() => { const s = game.metro.stations[0]; game.teleport(s.kx, undefined, s.kz, 0); return 1; })()`); await b.sleep(8000);
        await ev('(() => { game.metro.enter(0); return 1; })()');
        for (let k = 0; k < 60 && (await ev('game.metro.mode')) !== 'platform'; k++) await b.sleep(500);
        await b.sleep(2500);
        cam = JSON.parse(await ev(`(() => { const r = game.metro.root, V = r.position.constructor; const p = r.localToWorld(new V(-40, 2.6, 13)), t = r.localToWorld(new V(10, 1.4, 2)); return JSON.stringify({ eye: [p.x, p.y, p.z], look: [t.x, t.y, t.z], at: [p.x, p.z], metro: game.metro.mode }); })()`));
      }
      if (!cam) { R.err = 'no camera'; continue; }
      Object.assign(R, { eye: cam.eye.map((v) => +v.toFixed(1)), look: cam.look.map((v) => +v.toFixed(1)), road: cam.road, name: cam.name, district: await ev(`(() => { try { return game.city.districtAt?.(${cam.at[0]}, ${cam.at[1]}) || ''; } catch (e) { return ''; } })()`) });
      if (S.kind !== 'lobby' && S.kind !== 'metro') R.ready = JSON.parse(await ev(`(async () => JSON.stringify(await __qa.goArea(${cam.at[0]}, ${cam.at[1]}, 0, 25)))()`, 60000));
      await ev(`(() => { game.timeOfDay = ${S.tod ?? 12.5}; try { game.env?.regenerateEnvMap?.(); } catch (e) {} const e = ${JSON.stringify(cam.eye)}, l = ${JSON.stringify(cam.look)}; ${S.fov ? `game.camera.fov = ${S.fov}; game.camera.updateProjectionMatrix();` : ''}
        game.cameraOverride = (dt, c) => { c.position.set(e[0], e[1], e[2]); c.lookAt(l[0], l[1], l[2]); return true; }; return 1; })()`);
      await b.sleep(S.kind === 'world' ? 6000 : 4000);
      await b.screenshot(`${DIR}/${S.id}_a.png`);
      await ev('new Promise((r) => { let n = 10; const f = () => (--n <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })');
      await b.screenshot(`${DIR}/${S.id}_b.png`);
      // what is in view: floating / sunk objects near the look point, materials whose texture never loaded, pure magenta materials
      const c2 = [(cam.eye[0] + cam.look[0]) / 2, (cam.eye[2] + cam.look[2]) / 2];
      if (!cam.interior && S.kind !== 'metro') {
        const sc = JSON.parse(await ev(`JSON.stringify(__qa.scanArea(${c2[0]}, ${c2[1]}, 40, 0))`, 120000) || 'null');
        if (sc) R.audit = { float: sc.float.slice(0, 12), sink: sc.sink.slice(0, 12), nFloat: sc.float.length, nSink: sc.sink.length, plantsInCars: sc.plantsInCars };
      }
      R.mats = JSON.parse(await ev(`(() => { const cam = game.camera, fr = new game.THREE.Frustum().setFromProjectionMatrix(new game.THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); const bad = {}, s = new game.THREE.Sphere(); let n = 0;
        game.scene.traverseVisible((o) => { if (!o.isMesh || !o.geometry) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); if (!o.isInstancedMesh && !fr.intersectsSphere(s)) return; n++;
          for (const m of [].concat(o.material)) { if (!m) continue; const why = []; for (const k of ['map', 'normalMap', 'roughnessMap']) { const t = m[k]; if (t && (!t.image || (t.image.width === 0 && !t.isDataTexture && !t.isCompressedTexture))) why.push(k + ' not loaded'); }
            if (m.color && m.color.r > 0.9 && m.color.g < 0.1 && m.color.b > 0.9) why.push('magenta'); if (why.length) { const k = (o.name || o.parent?.name || '?') + '|' + (m.name || m.type); bad[k] = why.join(','); } } });
        return JSON.stringify({ meshesInView: n, bad: Object.entries(bad).slice(0, 15) }); })()`));
      await ev('(() => { game.cameraOverride = null; game.camera.fov = 60; game.camera.updateProjectionMatrix(); return 1; })()');
      if (S.kind === 'metro') { await ev('(() => { try { game.metro.exit?.(); } catch (e) {} return 1; })()'); await b.sleep(1500); }
    } catch (e) { R.err = String(e.message || e).slice(0, 300); }
    R.s = Math.round((Date.now() - t0) / 1000);
    console.log(S.id, JSON.stringify({ d: R.district, road: R.road, ready: R.ready, nFloat: R.audit?.nFloat, nSink: R.audit?.nSink, badMats: R.mats?.bad?.length, err: R.err, s: R.s }));
    save();
  }
  rep.cur = 'end'; rep.console = [...con.values()];
  console.log('console', rep.console.length, rep.console.filter((c) => c.lvl !== 'warning').length, 'errors');
  save();
});
save();
try { console.log(execFileSync('python3', ['tools/v2/qa/visual_analyze.py'], { encoding: 'utf8' })); } catch (e) { console.log('analyze failed', e.message.slice(0, 300)); }

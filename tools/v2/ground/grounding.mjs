#!/usr/bin/env node
// r2-ground grounding audit (micro-relief): per place, teleport there, let the tiles stream, then measure against the PHYSICS ground
// (Rapier ray down) within R m of the place:
//   - every instanced plant / prop origin (instances standing more than 0.12 m above or below the collider = float / sink)
//   - parked cars (body height above the collider vs the median of all cars)
//   - the player's feet after a walk across the place (feet height above the collider)
// Run with --q "&relief=0" for the A/B baseline. node tools/v2/ground/grounding.mjs --set g1 [--q ...] [--places "x,z;x,z"]
import fs from 'node:fs';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const SET = o.set || 'g',
  R = +(o.r || 90);
const rep = { set: SET, q: o.q || '', places: {} };
await withBrowser({ width: 960, height: 540, maxSeconds: 1200 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (o.q || ''));
  await b.waitFor(GAME_READY + ' && !!game.nicoHouse', 900);
  await startGame(b, 60);
  let places = o.places
    ? String(o.places)
        .split(';')
        .map((s) => s.split(',').map(Number))
    : null;
  if (o.park) {
    const pk = JSON.parse(
      await b.eval(
        `(() => { const D = game.miamiData; for (let r = 200; r < 12000; r += 250) for (let k = 0; k < 32; k++) { const x = Math.cos(k / 32 * 6.283) * r, z = Math.sin(k / 32 * 6.283) * r; if (D.inRealMiami(x, z) && D.coverAt(x, z) === 'park' && D.coverAt(x + 20, z) === 'park' && D.coverAt(x, z + 20) === 'park') return JSON.stringify([+x.toFixed(1), +z.toFixed(1)]); } return 'null'; })()`,
      ),
    );
    if (pk) {
      places = places || [];
      places.push(pk);
    }
  }
  if (!places)
    places = JSON.parse(
      await b.eval(`(() => { const NH = game.nicoHouse, p = NH.toWorld(new game.THREE.Vector3(0, 0, 10)); const out = [[+p.x.toFixed(1), +p.z.toFixed(1)]];
    // a rural / wilderness spot with real relief near a road (searched outward from the house)
    const th = game.miamiData.terrainHeightAt, G = game.city.roadGraph;
    if (th.relief) for (let r = 300; r < 6000 && out.length < 3; r += 150) for (let k = 0; k < 24 && out.length < 3; k++) { const x = p.x + Math.cos(k / 24 * 6.283) * r, z = p.z + Math.sin(k / 24 * 6.283) * r;
      const zn = game.miamiData.zoneAt(x, z); if (!/rural|wilderness/.test(zn)) continue; if (Math.abs(th.relief(x, z)) < 0.12) continue; const ne = G.nearestEdge(x, z, {}, 80); if (!ne || ne.dist > 70) continue;
      if (out.some((q) => Math.hypot(q[0] - x, q[1] - z) < 1500)) continue; out.push([+x.toFixed(1), +z.toFixed(1)]); }
    return JSON.stringify(out); })()`),
    );
  console.log('places', JSON.stringify(places));
  rep.reliefStats = JSON.parse(
    await b.eval('JSON.stringify(game.miamiData.terrainHeightAt.reliefStats || null)'),
  );
  console.log('relief', JSON.stringify(rep.reliefStats));
  for (const pl of places) {
    await b.eval(`(() => { game.teleport(${pl[0]}, undefined, ${pl[1]}, 0); return 1; })()`);
    await b.sleep(15000);
    for (let i = 0; i < 30; i++) {
      const q = await b.eval('(game.city?.streamer?.pending?.() ?? 0)');
      if (q < 2) break;
      await b.sleep(1000);
    }
    // walk: the player runs forward ~6 s (W), feet sampled
    await b.key('KeyW', true, 'w');
    const feet = [];
    for (let i = 0; i < 12; i++) {
      await b.sleep(500);
      feet.push(
        await b.eval(
          `(() => { const P = game.player.position, R = game.RAPIER || window.RAPIER; let hy = null; try { const h = game.world.castRay(new R.Ray({ x: P.x, y: P.y + 1.5, z: P.z }, { x: 0, y: -1, z: 0 }), 4, true, undefined, undefined, undefined, game.player.body || undefined); if (h) hy = P.y + 1.5 - (h.timeOfImpact ?? h.toi); } catch (e) {} return hy === null ? null : +(P.y - hy).toFixed(3); })()`,
        ),
      );
    }
    await b.key('KeyW', false, 'w');
    const r = JSON.parse(
      await b.eval(`(() => { const T = game.THREE, R = game.RAPIER || window.RAPIER, c = new T.Vector3(${pl[0]}, 0, ${pl[1]}), M = new T.Matrix4(), P = new T.Vector3();
      const ST = R.ShapeType || {}; const groundC = (c) => { try { const t = c.shapeType(); if (t === ST.TriMesh || t === ST.HeightField) return true; if (t === ST.Cuboid) { const he = c.halfExtents(); return he.x > 4 && he.z > 4; } } catch (e) {} return false; }; // terrain / ground slabs only (no trunks, props, cars)
      const ray = (x, y, z) => { try { const h = game.world.castRay(new R.Ray({ x, y: y + 4, z }, { x: 0, y: -1, z: 0 }), 12, true, undefined, undefined, undefined, undefined, groundC); return h ? y + 4 - (h.timeOfImpact ?? h.toi) : null; } catch (e) { return null; } };
      const out = { inst: 0, float: 0, sink: 0, worst: [], byName: {}, cars: [] };
      game.scene.traverse((o) => { if (!o.isInstancedMesh || !o.visible || !o.count) return; let v = true; for (let q = o; q; q = q.parent) if (q.visible === false) { v = false; break; } if (!v) return;
        const nm = (o.name || o.parent?.name || '?').slice(0, 40); if (/groundGrass|lawn|blade|npc|person|car|wheel|rain|bird|cloud|particle/i.test(nm)) return;
        const step = Math.max(1, Math.floor(o.count / 400));
        for (let i = 0; i < o.count; i += step) { o.getMatrixAt(i, M); P.setFromMatrixPosition(M).applyMatrix4(o.matrixWorld); if (Math.hypot(P.x - c.x, P.z - c.z) > ${R}) continue;
          if (M.elements[0] === 0 && M.elements[5] === 0) continue; const hy = ray(P.x, P.y, P.z); if (hy === null) continue; const d = P.y - hy; if (Math.abs(d) > 1.5) continue; // on a deck / roof / under a bridge: not ground
          out.inst++; const bn = out.byName[nm] = out.byName[nm] || { n: 0, f: 0, s: 0 }; bn.n++;
          if (d > 0.03) { out.float++; bn.f++; } else if (d < -0.15) { out.sink++; bn.s++; }
          if ((d > 0.03 || d < -0.15) && out.worst.length < 16 && out.worst.filter((w) => w[0] === nm).length < 3) { const th = game.miamiData.terrainHeightAt; out.worst.push([nm, +P.x.toFixed(1), +P.z.toFixed(1), +d.toFixed(2), 'y', +P.y.toFixed(2), 'ray', +hy.toFixed(2), 'terr', +game.city.terrain.heightAt(P.x, P.z).toFixed(2), 'rel', th.relief ? +th.relief(P.x, P.z).toFixed(2) : 0]); } } });
      for (const v of game.vehicles.list) { if (!v.body || v.boat || v.isBoat || v.playerDriven) continue; const p = v.body.translation(); if (Math.hypot(p.x - c.x, p.z - c.z) > ${R}) continue; const hy = ray(p.x, p.y - 1, p.z); if (hy !== null) out.cars.push(+(p.y - hy).toFixed(3)); }
      for (const k in out.byName) if (!out.byName[k].f && !out.byName[k].s) delete out.byName[k];
      return JSON.stringify(out); })()`),
    );
    const cs = [...r.cars].sort((x, y) => x - y),
      med = cs.length ? cs[Math.floor(cs.length / 2)] : 0;
    r.carOff = cs.filter((v) => Math.abs(v - med) > 0.1).length;
    r.carMed = med;
    r.feet = feet;
    r.feetBad = feet.filter((v) => v !== null && (v > 0.05 || v < -0.15)).length;
    rep.places[pl.join(',')] = r;
    console.log(
      pl.join(','),
      JSON.stringify({
        inst: r.inst,
        float: r.float,
        sink: r.sink,
        cars: r.cars.length,
        carOff: r.carOff,
        feetBad: r.feetBad,
        worst: r.worst.slice(0, 6),
        byName: r.byName,
      }),
    );
  }
  if (b.errors.length) {
    rep.errors = [...new Set(b.errors)].slice(0, 20);
    console.log('ERRORS', rep.errors.join('\n'));
  }
});
fs.writeFileSync(`docs/v2/reports/ground-grounding-${SET}.json`, JSON.stringify(rep, null, 1));

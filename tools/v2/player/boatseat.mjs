#!/usr/bin/env node
// Boat driver pose check (PLAYER helper): spawns boats in open water off Nico's dock, puts Nico at the helm, and shoots him
// from the side, the front three-quarter and close up at the controls, idling and at speed in a turn.
//   node tools/v2/player/boatseat.mjs --set b0 [--boats skiff,console,jetski] -> docs/v2/shots/player/boat/<set>_*.jpg
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) continue;
  const next = args[i + 1];
  opt[args[i].slice(2)] = next && !next.startsWith('--') ? args[++i] : true;
}
const SET = opt.set || 'b';
const BOATS = String(opt.boats || 'skiff,console').split(',');
const DIR = path.resolve('docs/v2/shots/player/boat');
fs.mkdirSync(DIR, { recursive: true });

// open water near the dock: a ring search for a point with water 25 m around
const FIND_SPOT = `(() => {
  const c = game.city;
  const d = game.nicoHouse.anchors.dock || game.nicoHouse.anchors.skiff;
  for (let r = 20; r < 600; r += 15) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = d.pos.x + Math.cos(a) * r;
      const z = d.pos.z + Math.sin(a) * r;
      let ok = c.isWater(x, z);
      for (let j = 0; j < 8 && ok; j++) {
        const b = (j / 8) * Math.PI * 2;
        ok = c.isWater(x + Math.cos(b) * 25, z + Math.sin(b) * 25);
      }
      if (ok) return JSON.stringify({ x, z });
    }
  }
  return 'null';
})()`;

// camera around the boat, in the boat's frame (x port, y up, z bow)
const camAt = (lx, ly, lz, look) => `(() => {
  const v = window.__boat;
  game.cameraOverride = (dt, cam) => {
    const m = v.mesh;
    m.updateWorldMatrix(true, false);
    const p = m.localToWorld(new game.THREE.Vector3(${lx}, ${ly}, ${lz}));
    const t = m.localToWorld(new game.THREE.Vector3(${look.join(', ')}));
    cam.position.copy(p);
    cam.lookAt(t);
    return true;
  };
  return 1;
})()`;

const files = [];
await withBrowser({ width: 960, height: 540, maxSeconds: 280 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute' + (opt.q ? '&' + opt.q : ''));
  await b.waitFor(
    GAME_READY + " && typeof game.teleport === 'function' && game.vehicles?.spawnBoat",
    200,
  );
  await startGame(b);
  const spot = JSON.parse(await b.eval(FIND_SPOT));
  console.log('spot', spot);
  const shoot = async (name) => {
    const f = path.join(DIR, `${SET}_${name}.jpg`);
    await b.screenshot(f, { format: 'jpeg', quality: 85 });
    files.push(f);
  };
  for (const key of BOATS) {
    await b.eval(`(() => {
      game.timeExternal = true;
      game.timeOfDay = 11;
      if (game.player.state.inVehicle) game.exitVehicle?.();
      if (window.__boat) game.vehicles.removeBoat?.(window.__boat);
      game.teleport(${spot.x} + 3, undefined, ${spot.z}, 0);
      window.__boat = game.vehicles.spawnBoat('${key}', { x: ${spot.x}, z: ${spot.z} }, 0.4);
      return 1;
    })()`);
    await b.sleep(3500);
    await b.eval('(() => { game.enterVehicle(window.__boat); return 1; })()');
    await b.sleep(2500);
    const info = await b.eval(`(() => {
      const ch = game.playerCharacter, v = window.__boat, T = game.THREE;
      const loc = (n) => {
        const bone = ch.getBone(n);
        if (!bone) return null;
        const p = v.mesh.worldToLocal(bone.getWorldPosition(new T.Vector3()));
        return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
      };
      return JSON.stringify({ seated: !!game.playerSeat?.seated, hips: loc('Hips'), lFoot: loc('LeftFoot'),
        rFoot: loc('RightFoot'), anchor: ch._seat?.anchor && { hip: ch._seat.anchor.hip?.toArray?.(), recline: ch._seat.anchor.recline, standing: ch._seat.anchor.standing }, lHand: loc('LeftHand'), rHand: loc('RightHand'), head: loc('Head') });
    })()`);
    console.log(key, info);
    if (opt.probe)
      console.log(
        'profile',
        await b.eval(`(() => {
      const v = window.__boat, T = game.THREE, root = v.mesh, wh = v.visual?.parts?.wheel;
      if (!wh) return 'no wheel';
      root.updateWorldMatrix(true, true);
      const w = root.worldToLocal(wh.getWorldPosition(new T.Vector3()));
      const meshes = [];
      root.traverse((o) => { if (o.isMesh && o.visible !== false && !o.isSkinnedMesh) meshes.push(o); });
      for (const m of meshes) if (m.material && !Array.isArray(m.material)) m.material.side = T.DoubleSide;
      const rc = new T.Raycaster();
      game.playerCharacter.root.visible = false;
      const out = ['wheel ' + w.toArray().map((x) => x.toFixed(2))];
      for (let dz = 0; dz >= -1.4; dz -= 0.1) {
        const o = root.localToWorld(new T.Vector3(w.x, w.y + 0.6, w.z + dz));
        const d = root.localToWorld(new T.Vector3(w.x, w.y - 0.4, w.z + dz)).sub(o).normalize();
        rc.set(o, d); rc.far = 4;
        const h = rc.intersectObjects(meshes, false).filter((x) => !/npc-|character/.test(x.object.parent?.name || ''))[0];
        out.push(dz.toFixed(1) + ':' + (h ? root.worldToLocal(h.point.clone()).y.toFixed(2) + ' ' + (h.object.name || h.object.material?.name || '') : '-'));
      }
      game.playerCharacter.root.visible = true;
      return out.join(' | ');
    })()`),
      );
    if (opt.probe) {
      await b.eval('(() => { game.playerCharacter.root.visible = false; return 1; })()');
      await b.eval(camAt(1.3, 1.9, -2.6, [0, 0.8, -0.9]));
      await b.sleep(500);
      await shoot(`${key}_helm_empty`);
      await b.eval('(() => { game.playerCharacter.root.visible = true; return 1; })()');
      await b.eval(camAt(1.3, 1.9, -2.6, [0, 0.8, -0.9]));
      await b.sleep(300);
      await shoot(`${key}_helm`);
    }
    await b.eval(camAt(4.2, 1.6, 0.2, [0, 1.0, 0]));
    await b.sleep(500);
    await shoot(`${key}_side`);
    await b.eval(camAt(2.0, 2.0, 3.2, [0, 1.0, -0.4]));
    await b.sleep(500);
    await shoot(`${key}_front`);
    await b.eval(camAt(1.4, 1.9, 0.6, [0, 1.0, -0.2]));
    await b.sleep(500);
    await shoot(`${key}_close`);
    // under way, in a turn: the pose must ride the hull's pitch and roll
    await b.eval(`(() => {
      for (const code of ['KeyW', 'KeyA']) dispatchEvent(new KeyboardEvent('keydown', { code }));
      return 1;
    })()`);
    await b.sleep(3500);
    await b.eval(camAt(4.6, 1.8, 0.5, [0, 1.0, 0]));
    await b.sleep(400);
    await shoot(`${key}_turn`);
    await b.eval(`(() => {
      for (const code of ['KeyW', 'KeyA']) dispatchEvent(new KeyboardEvent('keyup', { code }));
      game.cameraOverride = null;
      return 1;
    })()`);
  }
  if (b.errors.length) console.log('CONSOLE ERRORS', b.errors.slice(0, 6));
});
execFileSync('python3', [
  'tools/v2/montage.py',
  path.join(DIR, `${SET}_sheet.jpg`),
  '--w',
  '480',
  ...files,
]);
console.log('sheet', path.join(DIR, `${SET}_sheet.jpg`));

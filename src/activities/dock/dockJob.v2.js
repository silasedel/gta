// DOCK SHIFT (activities): a short paid shift at the Dodge Island port for Gulfstream Stevedores. Clock in with the
// foreman at his cabin (E), then:
//   1. load the van: carry crates from the pallet stack to the back of the cargo van (E to pick up / E to drop), 5 crates;
//   2. check the container seals: hold E at each marked container door for 2 s, 3 containers;
//   3. clock out with the foreman: pay ($22 a crate, $18 a seal, + $45 on-time bonus), "Shift complete" card.
// Repeatable after a cool-down. Quitting: walk off the yard (over 120 m) or ask the foreman. Paid shift with game.wallet.wage.
// API (game.dockJob): { state, step, start(), quit(), site }. Off with ?dockjob=0.
import * as THREE from 'three';
import { createMarker } from '../../gameplay/markers.js';
import { getHub, blip, help, notify, canAct, say, sfx, pill, clock, local, groundY, fmt, loadGLB, fit, shadows, canvasTex, earnCash } from '../common.js';
import { DOCK_JOB } from '../sites.data.js';
import { carryPose } from './carry.js';

export const order = 190;
const FOREMAN = 'Foreman Ruiz';

export async function initV2(game) {
  if (/[?&]dockjob=0\b/.test(location.search)) return;
  const city = game.city; if (!city) return;
  const H = getHub(game);
  const def = DOCK_JOB;
  const J = { state: 'idle', step: 0, crates: 0, seals: 0, t: 0, carrying: null, geo: undefined, root: null, body: null, foreman: null, van: null, marker: null, cooldown: 0, holdT: 0 };
  const P = () => game.player.position;
  J.blip = blip(game, { x: def.x, z: def.z, kind: 'job', color: '#ffd25a', label: 'Dock shift · Gulfstream Stevedores', prio: 80 });

  // ---------------------------------------------------------------- the yard (snapped beside the nearest port road)
  function locate() {
    const rg = city.roadGraph;
    let px = def.x, pz = def.z, dx = 1, dz = 0, hw = 6;
    try { const r = rg?.nearestEdge?.(def.x, def.z, null, 300); if (r) { px = r.point.x; pz = r.point.z; dx = r.dir.x; dz = r.dir.z; hw = r.edge.width / 2; } } catch (e) { /* */ }
    // the side of the road that is dry land and not a building
    for (const sg of [1, -1]) {
      const nx = -dz * sg, nz = dx * sg, o = { x: px + nx * (hw + 14), z: pz + nz * (hw + 14) };
      let ok = true; for (const [a, b] of [[0, 0], [8, 0], [-8, 0], [0, 8], [8, 8], [-8, 8]]) { const q = { x: o.x + dx * a + nx * b, z: o.z + dz * a + nz * b }; if (city.isWater(q.x, q.z)) ok = false; }
      if (ok) return { x: o.x, z: o.z, heading: Math.atan2(-nx, -nz) };   // local +z faces the road
    }
    return { x: px - dz * (hw + 14), z: pz + dx * (hw + 14), heading: Math.atan2(dz, -dx) };
  }
  const L = (lx, lz) => local(J.geo, lx, lz);
  let crateProto = null;
  function containerMesh(color, brand) {
    const tex = canvasTex(512, 256, (g, w, h) => {
      const c = new THREE.Color(color); g.fillStyle = '#' + c.getHexString(); g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 5, h); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 8, 0, 3, h); }
      for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(90,50,20,${Math.random() * 0.18})`; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 14, 2 + Math.random() * 26); }
      g.font = '900 64px "Archivo Black", Impact, sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(brand, 30, 90);
      g.font = '700 22px Inter, Arial'; g.fillText('MRLU ' + (300000 + Math.floor(Math.random() * 600000)) + ' 4', 34, 128);
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.3 });
    const end = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.3 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.44, 2.59, 6.06), [end, end, end, end, end, m]);
    box.material = [m, m, end, end, end, end]; box.castShadow = box.receiveShadow = true;
    // doors on the -z end with locking bars
    const bars = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.4, metalness: 0.9 });
    for (const x of [-0.85, -0.35, 0.35, 0.85]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6), bars); b.position.set(x, 0, -3.05); box.add(b); }
    return box;
  }
  function build() {
    if (J.geo === undefined) { J.geo = locate(); J.blip.x = J.geo.x; J.blip.z = J.geo.z; }
    const G = J.geo, root = new THREE.Group(); root.name = 'dock-job'; game.scene.add(root); J.root = root;
    const gy = (x, z) => groundY(game, x, z);
    const { world, RAPIER } = game; J.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.heading);
    const col = (lx, lz, y, hx, hy, hz, yaw = 0) => { const p = L(lx, lz); const qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.heading + yaw); world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x, gy(p.x, p.z) + y, p.z).setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }), J.body); };
    const place = (obj, lx, lz, yaw = 0, y = 0) => { const p = L(lx, lz); obj.position.set(p.x, gy(p.x, p.z) + y, p.z); obj.rotation.y = G.heading + yaw; root.add(obj); return obj; };
    // foreman's cabin (the user's site cabin), the pallet stack, containers, a light tower
    loadGLB('assets/models/street/site_cabin.glb').then((m) => { if (!m || !J.root) return; place(shadows(fit(m, { length: 6 })), -9, 2, Math.PI / 2); });
    col(-9, 2, 1.3, 1.3, 1.3, 3);
    J.cabin = L(-6.6, 2.2);
    // pallet stack: wooden pallets with crates (the user's crate model)
    const pallet = new THREE.MeshStandardMaterial({ color: 0x9c7a50, roughness: 0.9 });
    for (const [lx, lz] of [[5, -3], [6.4, -3], [5, -1.7]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 1.0), pallet); p.castShadow = p.receiveShadow = true; place(p, lx, lz, 0, 0.07); }
    J.crateSpots = [];
    loadGLB('assets/models/keys/crate.glb').then((m) => {
      if (!m || !J.root) return; crateProto = shadows(fit(m, { height: 0.5 }));
      for (const [lx, lz] of [[5, -3], [6.4, -3], [5, -1.7]]) for (let k = 0; k < 2; k++) { const c = crateProto.clone(); place(c, lx + (k ? 0.25 : -0.25), lz, (Math.random() - 0.5) * 0.2, 0.14); J.crateSpots.push(c); }
      for (let k = 0; k < 3; k++) { const c = crateProto.clone(); place(c, 5.6 + (k - 1) * 0.5, -2.4, 0.1 * k, 0.64); J.crateSpots.push(c); }
    });
    J.pallets = L(5.6, -1.0);
    col(5.7, -2.4, 0.4, 1.5, 0.4, 1.0);
    // containers: two in a row and one stacked, doors toward the yard
    const cols = [[0x1f5f8a, 'MARLINE'], [0xa4402a, 'SEAVANT'], [0x2f7d4a, 'MARLINE'], [0x9a8a2a, 'TRANSOL']];
    J.seals = [];
    [[-4, -12, 0], [0, -12, 0], [4, -12, 0], [0, -12, 2.6]].forEach(([lx, lz, y], i) => {
      const c = containerMesh(cols[i][0], cols[i][1]); place(c, lx, lz, Math.PI, y + 1.295);
      col(lx, lz, y + 1.3, 1.22, 1.3, 3.03);
      if (y === 0) J.seals.push({ at: L(lx, lz + 3.6), done: false });
    });
    // cargo van to load (the user's Corvo Cargo), back toward the pallets
    try { game.vehicles?.spawnParked?.('van1', { ...L(10, 4), heading: G.heading + Math.PI / 2 + Math.PI, wear: 0.5, locked: true }).then((v) => { if (!J.root) { try { game.vehicles.remove(v); } catch (e) { /* */ } return; } J.van = v; }).catch(() => null); } catch (e) { /* */ }
    J.vanBack = L(6.1, 4);
    // foreman
    const fp = L(-6.3, 3.4);
    try { J.foreman = game.npc?.spawnPosed?.({ place: 'dock', pos: { x: fp.x, y: gy(fp.x, fp.z), z: fp.z }, rot: G.heading + Math.PI / 2 + 0.3, pose: 'cross_arms', seed: 77 }) || null; } catch (e) { J.foreman = null; }
    J.foremanAt = fp;
  }
  function drop() {
    if (J.state === 'on') quit('You walked off the job.');
    if (J.root) { game.scene.remove(J.root); J.root = null; }
    if (J.body) { try { game.world.removeRigidBody(J.body); } catch (e) { /* */ } J.body = null; }
    try { J.foreman?.remove(); } catch (e) { /* */ } J.foreman = null;
    if (J.van && !J.van.everDriven && J.van !== game.player.state?.vehicle) { try { game.vehicles.remove(J.van); } catch (e) { /* */ } } J.van = null;
  }

  // ---------------------------------------------------------------- the shift
  function setMarker(at, color = 0xffd25a) {
    if (J.marker) { game.scene.remove(J.marker); J.marker = null; }
    if (!at) return;
    J.marker = createMarker(THREE, { color, radius: 1.1, icon: 'chevron', iconY: 1.6 }); J.marker.position.set(at.x, groundY(game, at.x, at.z) + 0.03, at.z); game.scene.add(J.marker);
  }
  function start() {
    if (J.state === 'on' || J.cooldown > 0 || !J.root) return false;
    J.state = 'on'; J.step = 1; J.crates = 0; J.seals.forEach((s) => (s.done = false)); J.t = 0;
    say(game, FOREMAN, 'You the new guy? Five crates into the van, then check the seals on those boxes. Move it, the ship leaves at six.', 4200, '#ffd25a');
    game.hud?.setMission?.('Dock shift: load 5 crates into the van');
    setMarker(J.pallets); game.emit?.('activity:start', { id: 'dockJob' });
    return true;
  }
  function quit(why) {
    if (J.state !== 'on') return;
    J.state = 'idle'; setCarry(false); setMarker(null); game.hud?.setMission?.(null); pill('dock', null); help(game, 'dock', null);
    notify(game, `Shift abandoned${why ? ': ' + why : ''}. No pay.`, 3500); J.cooldown = 30;
    game.emit?.('activity:end', { id: 'dockJob', ok: false });
  }
  function finish() {
    const onTime = J.t < def.par, gross = J.crates * def.perCrate + J.seals.length * def.perSeal + (onTime ? def.bonus : 0);
    J.state = 'idle'; setMarker(null); game.hud?.setMission?.(null); pill('dock', null);
    if (game.wallet?.wage) { game.wallet.wage({ job: 'dock_worker', gross, employer: 'Gulfstream Stevedores', method: 'cash', memo: 'Dock shift' }); sfx(game, 'cash', P(), 0.7); }
    else earnCash(game, gross, 'Dock shift', 'Gulfstream Stevedores', 'wages');
    say(game, FOREMAN, onTime ? 'Not bad. Not bad at all. Come back tomorrow.' : 'Slow, but it\'s done. Here.', 3000, '#ffd25a');
    try { game.passed?.play?.({ title: 'Shift complete', sub: `Gulfstream Stevedores · ${fmt(gross)}${onTime ? ' · on-time bonus' : ''}` }); } catch (e) { /* */ }
    notify(game, `Dock shift paid: ${fmt(gross)} (${J.crates} crates, ${J.seals.length} seals${onTime ? `, on-time bonus ${fmt(def.bonus)}` : ''})`, 5000);
    J.cooldown = def.cooldown; game.stats?.add?.('dockShifts', 1);
    game.emit?.('jobEnd', { id: 'dockJob', ok: true, pay: gross });
  }
  // carrying a crate: the crate rides in front of the chest, the arms hold it (carry.js), sprinting is off
  function setCarry(on) {
    if (on && !J.carrying && crateProto) { const c = crateProto.clone(); c.scale.multiplyScalar(0.9); game.scene.add(c); J.carrying = c; const s = J.crateSpots.pop(); if (s) s.visible = false; J.hidden = (J.hidden || []).concat(s ? [s] : []); }
    if (!on && J.carrying) { game.scene.remove(J.carrying); J.carrying = null; }
  }
  function tick(dt, s, d) {
    if (J.cooldown > 0) J.cooldown -= dt;
    if (J.marker) J.marker.userData.ring && (J.marker.userData.ring.rotation.z += dt);
    if (J.foreman && d < 30) J.foreman.lookAt = P();
    const canE = canAct(game) && !game.player.state?.inVehicle;
    const dF = Math.hypot(P().x - J.foremanAt.x, P().z - J.foremanAt.z);
    if (J.state !== 'on') {
      if (dF < 2.4 && canE) {
        help(game, 'dock', J.cooldown > 0 ? `Come back in ${Math.ceil(J.cooldown)} s for another shift` : `Press <b>E</b> to clock in for a dock shift (about ${fmt(def.perCrate * 5 + def.perSeal * 3 + def.bonus)})`);
        if (J.cooldown <= 0 && game.input.pressed('KeyE')) { help(game, 'dock', null); start(); }
      } else help(game, 'dock', null);
      return;
    }
    if (game.ui?.dead || game.ui?.arrested) { quit(game.ui.dead ? 'you went down' : 'you got arrested'); return; }
    if (d > 120) { quit('you left the yard'); return; }
    J.t += dt;
    pill('dock', `<span style="color:#ffd25a">DOCK SHIFT</span> &nbsp;${J.step === 1 ? `crates ${J.crates}/5` : J.step === 2 ? `seals ${J.seals.filter((q) => q.done).length}/${J.seals.length}` : 'clock out'} &nbsp;${clock(Math.max(0, def.par - J.t))}`, J.t > def.par);
    // the crate in his arms
    if (J.carrying) { try { carryPose(game, J.carrying); } catch (e) { /* */ } }
    if (J.step === 1) {
      const dp = Math.hypot(P().x - J.pallets.x, P().z - J.pallets.z), dv = Math.hypot(P().x - J.vanBack.x, P().z - J.vanBack.z);
      if (!J.carrying && dp < 2.4 && canE) { help(game, 'dock', 'Press <b>E</b> to pick up a crate'); if (game.input.pressed('KeyE')) { setCarry(true); sfx(game, 'cloth_move', P(), 0.6); setMarker(J.vanBack); help(game, 'dock', null); } }
      else if (J.carrying && dv < 2.6 && canE) {
        help(game, 'dock', 'Press <b>E</b> to load the crate');
        if (game.input.pressed('KeyE')) {
          setCarry(false); J.crates++; sfx(game, 'impact_wood', J.vanBack, 0.8); help(game, 'dock', null);
          if (J.crates >= 5) { J.step = 2; say(game, FOREMAN, 'Good. Now the seals: check every container door.', 3000, '#ffd25a'); game.hud?.setMission?.('Dock shift: check the seals on 3 containers'); nextSeal(); }
          else setMarker(J.pallets);
        }
      } else if (!(dp < 2.4) && !(dv < 2.6)) help(game, 'dock', null);
      if (J.carrying && game.player.state?.inVehicle) setCarry(false);
    } else if (J.step === 2) {
      const sl = J.seals.find((q) => !q.done);
      if (!sl) { J.step = 3; setMarker(J.foremanAt); game.hud?.setMission?.('Dock shift: clock out with the foreman'); return; }
      const ds = Math.hypot(P().x - sl.at.x, P().z - sl.at.z);
      if (ds < 2 && canE) {
        const held = game.input.down ? game.input.down('KeyE') : game.input.pressed('KeyE');
        J.holdT = held ? J.holdT + dt : Math.max(0, J.holdT - dt * 2);
        const k = Math.min(1, J.holdT / 2);
        help(game, 'dock', `Hold <b>E</b> to check the seal &nbsp;${'▮'.repeat(Math.round(k * 10))}${'▯'.repeat(10 - Math.round(k * 10))}`);
        if (k >= 1) { sl.done = true; J.holdT = 0; sfx(game, 'door', sl.at, 0.5); notify(game, ['Seal intact.', 'Seal checked.', 'Seal number matches the manifest.'][(Math.random() * 3) | 0], 1800); help(game, 'dock', null); nextSeal(); }
      } else { J.holdT = 0; if (ds < 4) help(game, 'dock', null); }
    } else if (J.step === 3) {
      if (dF < 2.4 && canE) { help(game, 'dock', 'Press <b>E</b> to clock out and get paid'); if (game.input.pressed('KeyE')) { help(game, 'dock', null); finish(); } }
      else help(game, 'dock', null);
    }
  }
  function nextSeal() { const sl = J.seals.find((q) => !q.done); setMarker(sl ? sl.at : J.foremanAt); }

  J.site = H.site({ id: 'dockJob', x: def.x, z: def.z, on: 240, off: 320, build, drop, tick, anchor: () => (J.geo ? J.geo : def) });
  H.api('dockJob', { get state() { return J.state; }, get step() { return J.step; }, start, quit, get site() { return J; } });
}

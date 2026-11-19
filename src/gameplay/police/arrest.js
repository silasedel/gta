// POLICE track: how a chase ends without a body bag. Surrender (H on foot: hands up), the one-star compliance window
// ("Police! Stop right there!"), the taser at one and two stars, cuffing on foot, pulling a stopped driver out of the car,
// and the booking scene after the arrest (mugshot against the height board, time served, release at the precinct).
// The arrest itself (fee, weapons confiscated, respawn at the station, the DETAINED card) stays in gameplay.js G.bust.
import * as THREE from 'three';
import { tryCall, sfx, distXZ, rand, pick, hasLOS } from '../util.js';
import { raiseHands } from '../gunHold.js';

const SHOUT = {
  stop: ['Police! Stop right there!', 'Southline PD! Don\'t move!', 'Police! Hands where I can see them!', 'Stop! Police!'],
  ground: ['Get on the ground! Now!', 'Down on the ground!', 'Hands up! Turn around!', 'On your knees!'],
  car: ['Driver! Hands on the wheel!', 'Shut the engine off! Hands out the window!', 'Step out of the vehicle! Now!'],
  running: ['He\'s running!', 'Suspect is fleeing on foot!', 'Stop running!', 'We got a runner!'],
  driving: ['He\'s taking off!', 'Vehicle is fleeing!'],
  taser: ['Taser! Taser!', 'Stop or I tase you!', 'Taser, taser, taser!'],
  cuff: ['You\'re under arrest.', 'Hands behind your back.', 'Don\'t resist. You\'re done.', 'Stop moving. You\'re under arrest.'],
  surrender: ['Keep those hands up!', 'Don\'t move! Stay right there!', 'Hands up, nice and slow!'],
  holdFire: ['Hold your fire! He\'s giving up!', 'Hold fire, hold fire!'],
};
const WINDOW = 6.5;          // s the one-star stop lasts before running away counts as evading
const CUFF_T = 1.6;          // s of cuffing
const TASE_R = [2.2, 8.5];   // taser range (m)

export function createArrest(game, G, law, police, comms) {
  const P = game.player, S = law.S, units = police.units;
  const A = { surrendered: false, stunT: 0, cuff: null, window: null, windowDone: false, pull: null, doorPoint: null, stillT: 0, jail: null, prevWeapon: null };
  const now = () => game.clock.elapsed;
  tryCall('binding', () => game.bindings?.register?.({ id: 'surrender', label: 'Hands up / surrender', group: 'On foot', context: 'foot', key: 'KeyH', pad: null }));

  // ------------------------------------------------------------------ player takeover (hands up, stunned, cuffed)
  const handsUp = { surrender: true, fixed() {}, anim: { speed: 0, grounded: true, handsUp: true } };
  const stunned = { stun: true, lock: true, fixed() {}, anim: { speed: 0, grounded: true, dead: true, deadStyle: 'front' } };
  const ours = () => P.script === handsUp || P.script === stunned;
  function holster() {
    if (P.weapon && P.weapon !== 'fist') { A.prevWeapon = P.weapon; P.weapon = 'fist'; game.emit?.('weaponChange', { weapon: 'fist' }); }
    P.aiming = false; tryCall('resetAim', () => G.resetAim?.());
  }
  function setSurrender(on) {
    if (on === A.surrendered) return;
    if (on) {
      if (P.state.inVehicle || P.swimming || G.dead || G.busted || (P.script && !ours())) return;
      A.surrendered = true; holster(); P.script = handsUp;
      const u = nearestUnit(35); if (u && S.level > 0) { comms.shout(u, pick(S.level >= 3 && now() - (G.lastShotT ?? -99) < 30 ? SHOUT.holdFire : SHOUT.surrender), { priority: 2 }); u.surrSeen = true; }
      game.emit?.('police:surrender', { level: S.level });
    } else {
      A.surrendered = false; if (P.script === handsUp) P.script = null;
    }
  }
  A.setSurrender = setSurrender;

  // ------------------------------------------------------------------ helpers
  function nearestUnit(maxD, needSee = false) {
    let best = null, bd = maxD;
    for (const u of units) { if (!u.active || u.dead || (needSee && !u.sees)) continue; const d = distXZ(u.pos, P.position); if (d < bd) { bd = d; best = u; } }
    return best;
  }
  function resisting() {
    const armed = !!G.playerArmedRecently?.();
    return (P.state.sprint && (P.state.speed || 0) > 4) || now() - (G.copAggroT ?? -99) < 4 || armed;
  }
  const holdFire = () => A.surrendered || A.stunT > 0 || !!A.cuff || (A.window && !A.window.failed);
  A.holdFire = holdFire;

  // ------------------------------------------------------------------ taser: two prongs on thin wires, a crackle, the suspect goes down
  const wireGeo = new THREE.BufferGeometry(); wireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  const wire = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0xd8dde4, transparent: true, opacity: 0.85 }));
  wire.frustumCulled = false; wire.visible = false; game.scene.add(wire);
  let wireT = 0, wireFrom = null; const _h = new THREE.Vector3();
  function crackle(pos) {
    const ctx = game.audio?.ctx; if (!ctx || game.audio?.muted) { sfx(game, 'punch_hit', pos, 0.6); return; }
    tryCall('taser audio', () => {
      const len = Math.floor(ctx.sampleRate * 0.75), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) { const gate = ((i / ctx.sampleRate) * 28) % 1 < 0.45 ? 1 : 0.15; d[i] = (Math.random() * 2 - 1) * gate * (1 - i / len); }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = 0.35;
      src.connect(f).connect(g).connect(game.audio.ambienceBus || ctx.destination); src.start();
    });
  }
  function tryTase(u, dist) {
    if (S.level === 0 || S.level > 2 || A.stunT > 0 || A.cuff || A.jail || P.state.inVehicle || G.dead || G.busted) return false;
    if (dist < TASE_R[0] || dist > TASE_R[1] || !u.sees || (u.taseCd || 0) > 0) return false;
    if (A.window && !A.window.failed) return false;   // they asked first
    if (A.surrendered) return false;
    u.taseCd = rand(3.5, 5.5);
    comms.shout(u, pick(SHOUT.taser), { priority: 2, gap: 2 });
    wireFrom = u; wireT = 0.55; wire.visible = true;
    crackle(P.position);
    const hit = Math.random() < (dist < 5 ? 0.8 : 0.55) && !(P.state.speed > 6 && Math.random() < 0.4);
    if (!hit) return true;
    A.stunT = 2.9; holster();
    if (A.surrendered) A.surrendered = false;
    if (!P.script || ours()) P.script = stunned;
    tryCall('fx', () => game.fx?.sparks?.(new THREE.Vector3(P.position.x, P.position.y + 1.1, P.position.z), new THREE.Vector3(0, 1, 0)));
    game.emit?.('police:tased', { by: u.name });
    tryCall('playerHit', () => game.emit?.('playerHit', { damage: 0, from: u, kind: 'taser' }));
    return true;
  }
  A.tryTase = tryTase;
  function wireTick(dt) {
    if (!wire.visible) return;
    wireT -= dt;
    if (wireT <= 0 || !wireFrom?.active) { wire.visible = false; return; }
    const u = wireFrom, a = wireGeo.attributes.position.array;
    if (u.hand) u.hand.getWorldPosition(_h); else _h.set(u.pos.x, u.pos.y + 1.2, u.pos.z);
    const px = P.position.x, py = P.position.y + 1.05, pz = P.position.z;
    a[0] = _h.x; a[1] = _h.y; a[2] = _h.z; a[3] = px + 0.08; a[4] = py + 0.1; a[5] = pz;
    a[6] = _h.x; a[7] = _h.y - 0.02; a[8] = _h.z; a[9] = px - 0.06; a[10] = py - 0.25; a[11] = pz;
    wireGeo.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the one-star stop
  function windowTick(dt) {
    if (S.level === 0) { A.window = null; A.windowDone = false; return; }
    if (S.level !== 1 && A.window && !A.window.failed) A.window = null;
    if (!A.window && !A.windowDone && S.level === 1 && S.seen) {
      const u = nearestUnit(32, true);
      const carNear = !u && police.cars.some((c) => !c.deployed && distXZ(c.v.body.translation(), P.position) < 30);
      if (u || carNear) {
        const inCar = !!P.state.inVehicle;
        A.window = { t: 0, x: P.position.x, z: P.position.z, unit: u, failed: false, inCar };
        A.windowDone = true;
        comms.shout(u, pick(inCar ? SHOUT.car : SHOUT.stop), { priority: 3, who: u ? undefined : 'Patrol car loudspeaker' });
        game.emit?.('police:stop', { inCar });
      }
    }
    const w = A.window; if (!w || w.failed) return;
    w.t += dt;
    if (w.t > 2.2 && !w.second && w.unit?.active) { w.second = true; comms.shout(w.unit, pick(SHOUT.ground), { priority: 2, gap: 1.5 }); }
    const moved = Math.hypot(P.position.x - w.x, P.position.z - w.z);
    const fleeingCar = P.state.inVehicle && (P.state.vehicle?.speedKmh || 0) > 28;
    if (!A.surrendered && (moved > 16 || fleeingCar || (w.t > WINDOW && moved > 6))) {
      w.failed = true;
      const u = nearestUnit(60);
      comms.shout(u, pick(fleeingCar ? SHOUT.driving : SHOUT.running), { priority: 3, gap: 0.5 });
      // running from a lawful stop is its own offence: the officer saw it, so it is known at once
      tryCall('evading', () => game.emit?.('crime', { type: 'evading', position: P.position.clone(), severity: 2, police: true, witnessed: false }));
    } else if (w.t > WINDOW + 6) A.window = null;
  }

  // ------------------------------------------------------------------ cuffing and pulling a driver out
  function startCuff(u, t0 = 0) {
    if (A.cuff || G.busted || G.dead) return;
    A.cuff = { u, t: t0 };
    if (A.surrendered) A.surrendered = false;
    if (P.script !== stunned) P.script = handsUp;
    comms.shout(u, pick(SHOUT.cuff), { priority: 3, gap: 0.5 });
    sfx(game, 'reload', P.position, 0.6);
  }
  function cuffTick(dt) {
    const c = A.cuff; if (!c) return;
    c.t += dt;
    const u = c.u;
    if (u?.active && !u.dead) { u.cuffing = true; u.heading = Math.atan2(P.position.x - u.pos.x, P.position.z - u.pos.z); }
    if (!u?.active || u.dead) { A.cuff = null; if (P.script === handsUp) P.script = null; return; }
    if (c.t >= CUFF_T) {
      A.cuff = null; u.cuffing = false; A.stunT = 0;
      const charges = S.charges.slice(), peak = S.peak, level = S.level, station = law.dispatchStation?.name || null;
      if (P.script === handsUp || P.script === stunned) P.script = null;
      A.jailInfo = { charges, peak, level, station };
      tryCall('bust', () => G.bust?.());
    }
  }
  function arrestTick(dt) {
    const lvl = S.level;
    if (lvl === 0 || G.dead || G.busted || A.jail) { A.doorPoint = null; A.pull = null; return; }
    // on foot: an officer within reach of a compliant suspect cuffs him
    if (!P.state.inVehicle && !A.cuff) {
      const still = (P.state.speed || 0) < 1.2 && !P.state.sprint;
      A.stillT = still ? A.stillT + dt : 0;
      const compliant = A.surrendered || A.stunT > 0 || (lvl <= 2 && !resisting() && A.stillT > 1.2);
      if (compliant) {
        for (const u of units) {
          if (!u.active || u.dead || u.staggerT > 0) continue;
          if (distXZ(u.pos, P.position) < 1.7 && Math.abs(u.pos.y - P.position.y) < 1.5) { startCuff(u); break; }
        }
      }
    }
    // in a stopped car at one or two stars: officers walk to the driver door and pull him out
    const v = P.state.inVehicle ? P.state.vehicle : null;
    if (v && !v.isBoat && !v.isAircraft && lvl <= 2 && (v.speedKmh || 0) < 5) {
      const door = tryCall('door', () => v.exitPosition?.(), null);
      A.doorPoint = door || null;
      if (door) {
        let near = null; for (const u of units) if (u.active && !u.dead && distXZ(u.pos, door) < 1.9) { near = u; break; }
        if (near) {
          if (!A.pull) { A.pull = { t: 0, u: near }; comms.shout(near, 'Out of the car! Now!', { priority: 3, gap: 1 }); }
          A.pull.t += dt;
          if (A.pull.t > 2.4) {
            A.pull = null;
            tryCall('exit', () => game.exitVehicle?.());
            sfx(game, 'door', door, 0.8);
            if (!P.state.inVehicle) startCuff(near, 0.3);
          }
        } else if (A.pull) A.pull.t = Math.max(0, A.pull.t - dt);
      }
    } else { A.doorPoint = null; A.pull = null; }
  }

  // ------------------------------------------------------------------ the booking scene
  const jailCss = `
.pl-jail{position:fixed;inset:0;z-index:60;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#eee}
.pl-jail .pl-black{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .6s ease}
.pl-jail .pl-flash{position:absolute;inset:0;background:#fff;opacity:0}
.pl-jail .pl-flash.go{animation:pl-flash .55s ease-out}
@keyframes pl-flash{0%{opacity:.95}100%{opacity:0}}
.pl-jail .pl-plac{position:absolute;left:50%;bottom:9vh;transform:translateX(-50%);background:#111;border:3px solid #ddd;padding:10px 26px 12px;min-width:min(34vw,520px);
  text-align:center;opacity:0;transition:opacity .4s ease;box-shadow:0 8px 28px rgba(0,0,0,.6)}
.pl-jail .pl-plac.on{opacity:1}
.pl-jail .pl-plac h3{margin:0;font:800 clamp(13px,1.1vw,18px)/1.2 system-ui;letter-spacing:.22em;color:#cfd6e4}
.pl-jail .pl-plac div{font:700 clamp(20px,2vw,34px)/1.25 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#fff}
.pl-jail .pl-plac small{display:block;font:600 clamp(11px,.85vw,14px)/1.3 ui-monospace,Menlo,monospace;color:#aab3c2;letter-spacing:.1em}
.pl-jail .pl-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .6s ease;width:min(60vw,760px)}
.pl-jail .pl-card.on{opacity:1}
.pl-jail .pl-card h1{margin:0 0 .3em;font:900 clamp(30px,3.6vw,64px)/1 system-ui;letter-spacing:.14em;color:#fff}
.pl-jail .pl-card .pl-ch{font:600 clamp(13px,1.1vw,19px)/1.6 system-ui;color:#c8ced8;letter-spacing:.06em;text-transform:uppercase}
.pl-jail .pl-card .pl-ts{margin-top:.8em;font:700 clamp(15px,1.4vw,24px)/1.4 system-ui;color:#e9edf3}
`;
  let jailEl = null;
  function jailDom() {
    if (jailEl) return jailEl;
    const st = document.createElement('style'); st.textContent = jailCss; document.head.appendChild(st);
    jailEl = document.createElement('div'); jailEl.className = 'pl-jail';
    jailEl.innerHTML = '<div class="pl-black"></div><div class="pl-flash"></div><div class="pl-plac"><h3>SOUTHLINE POLICE DEPARTMENT</h3><div class="pl-name"></div><small class="pl-meta"></small></div><div class="pl-card"><h1>TIME SERVED</h1><div class="pl-ch"></div><div class="pl-ts"></div></div>';
    document.body.appendChild(jailEl);
    return jailEl;
  }
  const q = (s) => jailEl.querySelector(s);
  function boardTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 1024; const g = c.getContext('2d');
    g.fillStyle = '#c9cdd1'; g.fillRect(0, 0, 512, 1024);
    for (let i = 0; i < 6000; i++) { const v = Math.random() < 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.05})`; g.fillRect(Math.random() * 512, Math.random() * 1024, 2, 2); }
    // 4'0" .. 7'0" in inches: board spans 1.2 m .. 2.4 m above the floor (1024 px = 1.2 m)
    g.fillStyle = '#1a1c20'; g.font = 'bold 34px Arial'; g.textAlign = 'left';
    for (let inch = 48; inch <= 94; inch += 2) {
      const y = 1024 - ((inch * 0.0254 - 1.2) / 1.2) * 1024; if (y < 0 || y > 1024) continue;
      const major = inch % 6 === 0;
      g.fillRect(0, y - (major ? 3 : 1.5), major ? 512 : 120, major ? 6 : 3);
      if (major) g.fillText(`${Math.floor(inch / 12)}'${inch % 12}"`, 14, y - 10);
    }
    g.fillStyle = 'rgba(20,22,26,.85)'; g.font = '900 40px Arial'; g.textAlign = 'right'; g.fillText('SOUTHLINE PD', 500, 60);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  let set = null;
  function buildSet() {
    // the most open direction around the release point frames the shot (no wall right behind the camera)
    const p = P.position.clone();
    let bestA = 0, bestD = -1;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, b = new THREE.Vector3(p.x + Math.sin(a) * 3.2, p.y + 1.6, p.z + Math.cos(a) * 3.2);
      const free = hasLOS(game, new THREE.Vector3(p.x, p.y + 1.6, p.z), b) ? 3.2 : 0;
      if (free > bestD) { bestD = free; bestA = a; }
    }
    const fx = Math.sin(bestA), fz = Math.cos(bestA);
    if (!set) {
      const tex = boardTexture();
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.85 });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), mat);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.0), new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.9, emissive: 0x2a2c2e }));
      const key = new THREE.PointLight(0xfff4e8, 0, 6, 2);
      set = { board, back, key, group: new THREE.Group() };
      set.group.add(back, board, key);
    }
    set.group.position.set(p.x, p.y, p.z); set.group.rotation.set(0, bestA, 0);
    set.back.position.set(0, 1.5, -0.75); set.board.position.set(0, 1.8, -0.72);
    set.key.position.set(0, 1.9, 1.6); set.key.intensity = 18;
    game.scene.add(set.group);
    set.cam = new THREE.Vector3(p.x + fx * 2.05, p.y + 1.62, p.z + fz * 2.05);
    set.look = new THREE.Vector3(p.x, p.y + 1.55, p.z);
    set.heading = bestA; set.pos = p;
    return set;
  }
  function removeSet() { if (set) game.scene.remove(set.group); if (set?.key) set.key.intensity = 0; }
  function hudHidden(on) { tryCall('hud', () => document.getElementById('ps-hud')?.classList.toggle('photo', on)); }
  const fmtCharge = (c) => (law.crimeName ? law.crimeName(c) : String(c).replace(/_/g, ' '));
  function startJail(info) {
    jailDom();
    A.jail = { t: 0, info: info || A.jailInfo || { charges: [], peak: 1 }, stage: 0 };
    A.jailInfo = null; A.cuff = null; A.surrendered = false; A.stunT = 0;
    comms.silence();
  }
  function jailTick(dt) {
    const J = A.jail; if (!J) return;
    J.t += dt;
    const black = q('.pl-black');
    if (J.stage === 0 && J.t > 2.6) { J.stage = 1; black.style.opacity = '1'; }
    // the arrest code teleports to the precinct at 3.5 s (G.busted clears); build the booking set after it
    if (J.stage === 1 && J.t > 3.6 && !G.busted) {
      J.stage = 2; const s = buildSet();
      hudHidden(true);
      P.heading = s.heading;
      J.script = { lock: true, jail: true, fixed() { tryCall('move', () => game.movePlayerTo?.(s.pos.x, s.pos.y, s.pos.z)); P.heading = J.profile ? s.heading + Math.PI / 2 : s.heading; }, anim: { speed: 0, grounded: true } };
      P.script = J.script;
      game.cameraOverride = J.cam = (cdt, cam) => { cam.position.copy(s.cam); cam.lookAt(s.look); if (cam.fov !== 30) { cam.fov = 30; cam.updateProjectionMatrix(); } return true; };
      const no = 'SL-' + String(((Date.now() / 1000) | 0) % 1000000).padStart(6, '0');
      const h = Math.floor(game.timeOfDay ?? 12), m = Math.floor(((game.timeOfDay ?? 12) % 1) * 60);
      q('.pl-name').textContent = (P.name || 'NICO').toUpperCase() + '  ' + no;
      q('.pl-meta').textContent = `DAY ${(game.day ?? 0) + 1}  ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}  ${(J.info.station || 'CENTRAL HOLDING').toUpperCase()}`;
    }
    if (J.stage === 2 && J.t > 4.1) { J.stage = 3; black.style.opacity = '0'; q('.pl-plac').classList.add('on'); }
    const flash = () => { const f = q('.pl-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); sfx(game, 'reload', P.position, 0.7); };
    if (J.stage === 3 && J.t > 5.0) { J.stage = 4; flash(); }
    if (J.stage === 4 && J.t > 6.4) { J.stage = 5; J.profile = true; }
    if (J.stage === 5 && J.t > 7.1) { J.stage = 6; flash(); }
    if (J.stage === 6 && J.t > 8.4) { J.stage = 7; black.style.opacity = '1'; q('.pl-plac').classList.remove('on'); }
    if (J.stage === 7 && J.t > 9.1) {
      J.stage = 8;
      const hours = Math.min(24, 3 + 2 * Math.max(1, J.info.peak || 1));
      const before = game.timeOfDay ?? 12, after = before + hours;
      game.timeOfDay = after % 24; if (after >= 24) game.day = (game.day ?? 0) + 1;
      tryCall('env', () => game.env?.regenerateEnvMap?.());
      game.emit?.('timeSkip', { minutes: hours * 60, reason: 'jail' });
      const ch = [...new Set(J.info.charges || [])].filter((c) => c !== 'warrant').slice(0, 5).map(fmtCharge);
      q('.pl-card .pl-ch').textContent = ch.length ? ch.join('  ·  ') : 'Outstanding warrant';
      q('.pl-card .pl-ts').textContent = `${hours} hours in holding. Weapons confiscated.`;
      q('.pl-card').classList.add('on');
      removeSet();
    }
    if (J.stage === 8 && J.t > 12.6) {
      J.stage = 9; q('.pl-card').classList.remove('on');
      if (game.cameraOverride === J.cam) game.cameraOverride = null;
      tryCall('fov', () => { const c = game.camera; if (c) { c.fov = game.settings?.fov || 60; c.updateProjectionMatrix(); } });
      if (P.script === J.script) P.script = null;
      hudHidden(false);
      black.style.opacity = '0';
    }
    if (J.stage === 9 && J.t > 13.4) { A.jail = null; game.emit?.('police:released', {}); }
  }
  game.on?.('arrest', () => startJail());
  game.on?.('playerDied', () => { A.cuff = null; A.stunT = 0; A.surrendered = false; A.window = null; if (ours()) P.script = null; comms.silence(); });

  // ------------------------------------------------------------------ per frame
  function tick(dt) {
    jailTick(dt);
    wireTick(dt);
    if (A.jail) return;
    for (const u of units) if (u.taseCd > 0) u.taseCd -= dt;
    // surrender key: on foot only; pressing again, or the case closing without an officer near, drops the hands
    if (!P.state.inVehicle && !A.cuff && A.stunT <= 0 && game.input?.pressed?.('KeyH')) setSurrender(!A.surrendered);
    if (A.surrendered && (P.state.inVehicle || P.script !== handsUp)) A.surrendered = false;
    if (A.stunT > 0) {
      A.stunT -= dt;
      if (A.stunT <= 0 && !A.cuff) { if (P.script === stunned) P.script = null; }
    }
    windowTick(dt);
    arrestTick(dt);
    cuffTick(dt);
    // hands up: the walk cycle's own overlay only flails while running, so pose the arms here (after the animation)
    const up = (A.surrendered || (A.cuff && P.script === handsUp)) && !P.state.inVehicle;
    A.upK = Math.max(0, Math.min(1, (A.upK || 0) + (up ? dt * 4 : -dt * 5)));
    if (A.upK > 0) tryCall('hands up', () => raiseHands(game.playerCharacter?.root, A.upK * A.upK * (3 - 2 * A.upK)));
    // prompt
    if (S.level > 0 && !P.state.inVehicle && !A.surrendered && !A.cuff && A.stunT <= 0 && nearestUnit(40)) law.help = 'Press <b>H</b> to put your hands up';
    else if (A.surrendered && S.level > 0) law.help = 'Hands up. Press <b>H</b> to lower them';
  }
  function reset() { A.cuff = null; A.window = null; A.windowDone = false; A.pull = null; A.stunT = 0; if (A.surrendered) setSurrender(false); }
  return Object.assign(A, { tick, tryTase, startJail, reset, get busy() { return !!(A.cuff || A.jail || A.stunT > 0); } });
}

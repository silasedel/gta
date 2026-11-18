import * as THREE from 'three';
import { seatCharacter, unseatCharacter, solveSeat } from '../npc/seat.js';
// Southline — the player visibly sits in the driver's seat of cars, posed by the shared seat solver (src/npc/seat.js) on the
// car's measured seat anchor (r2-cars: v.seatAnchor(0), shell space): hips on the H-point, hands on the wheel, feet on the
// pedals, head under the roof. Entering slides him from the door into the seat while the pose blends; leaving blends the
// seated pose back out. Hidden as before for boats, bikes, aircraft or anything without a car shell. enter() returns
// false when it did not seat him (the caller hides him then).
const ENTER_S = 0.55;
// r4-anim (user: "you should actually just take a step out of the car like normal, not like now where he just spawns on his
// butt out of the car"): leaving a car plays the reverse of the enter, driven by the same seat solver on the car's measured
// anchor: hands come off the wheel onto the thighs while he turns toward the door and swings his legs out over the sill
// (feet down to the ground outside), then he leans forward and stands up out of the door opening (hips out first, head
// low under the roof line; from a tall cab the hips drop and he steps down), then one step to the exit spot, where normal
// walking takes over. Door side blocked (the exit spot is on the other side): he first slides across to the passenger seat.
// Input is locked meanwhile (main.js: game.player.script), the camera glides from the car to the exit spot.
// ?r4exit=0 = the old instant exit (seated pose blended out on the spot).
const R4EXIT = !(typeof location !== 'undefined' && /[?&]r4exit=0/.test(location.search));
const EX = { across: 0.42, swing: 0.26, rise: 0.4, riseTall: 0.46, step: 0.24 };
const ss = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp;
const ARM_BONES = ['LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function createPlayerSeat(game) {
  let cur = null;
  const anchorOf = (v) => { try { return v.seatAnchor?.(0) || game.vehicles?.seatAnchor?.(v, 0) || null; } catch (e) { return null; } };
  // boats (r2-water's fleet + the airboat): the airboat's raised driver seat (left hand on the rudder stick, feet on the
  // footrest); the other boats at their helm wheel, standing at a leaning post or seated on a helm chair, found by probing
  // the boat's own meshes (deck and chair under the helm) in the boat's frame (+z bow, +x port = the driver's left)
  const _rc = new THREE.Raycaster();
  function boatAnchor(v) {
    const t = v.spec || {}, root = v.mesh; if (!root) return null;
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const meshesOf = () => { const out = []; root.updateWorldMatrix(true, true); root.traverse((o) => { if (!o.isMesh || o.visible === false || o.isSkinnedMesh) return; const mn = (o.material?.name || '') + ' ' + (o.name || ''); if (/cage|prop|decal|glass/i.test(mn)) return; let p = o, person = false; while (p) { if (p.name && /^(npc-|character-)/.test(p.name)) { person = true; break; } p = p.parent; } if (!person) out.push(o); }); return out; };
    const castDown = (meshes, x, y, z, far = 3) => { const o = root.localToWorld(V3(x, y, z)), d = root.localToWorld(V3(x, y - 1, z)).sub(o).normalize(); _rc.set(o, d); _rc.far = far;
      const sides = []; for (const m of meshes) { const mt = m.material; if (mt && !Array.isArray(mt) && mt.side !== THREE.DoubleSide) { sides.push([mt, mt.side]); mt.side = THREE.DoubleSide; } }
      try { const h = _rc.intersectObjects(meshes, false)[0]; return h ? root.worldToLocal(h.point.clone()).y : null; } finally { for (const [mt, sd] of sides) mt.side = sd; } };
    if (v.isAirboat || t.airboat) {
      // the raised driver's seat: walking aft along the centerline, the first surface well above the deck is the cushion
      const st = t.seat || [0, 0.86, -0.88];
      const M = meshesOf(); let seatZ = null, seatY = null, deck = null;
      for (let z = 0.6; z > -2.4; z -= 0.05) {
        const y = castDown(M, 0, 2.6, z, 3.2); if (y === null) continue;
        if (deck === null && y < 0.6) deck = y;
        if (deck !== null && y > deck + 0.45 && y < deck + 1.4) { seatZ = z; seatY = y; break; }
      }
      const sy = seatY ?? st[1], sz = seatZ !== null ? seatZ - 0.2 : st[2], dk = deck ?? (sy - 0.5);
      return { id: 'driver', i: 0, yaw: 0, open: true, recline: 6, doorX: 1.3, roofY: NaN, wheel: null,
        hip: V3(0, sy + 0.1, sz), heel: V3(0, Math.max(dk, sy - 0.55), sz + 0.62),
        grips: [{ side: 'Left', p: V3(0.3, sy + 0.32, sz + 0.4) }] };
    }
    const wh = v.visual?.parts?.wheel; if (!wh) return null;
    root.updateWorldMatrix(true, true);
    const w = root.worldToLocal(wh.getWorldPosition(new THREE.Vector3()));
    const meshes = []; root.traverse((o) => { if (o.isMesh && o.visible !== false && !o.isSkinnedMesh) { let p = o, person = false; while (p) { if (p.name && /^(npc-|character-)/.test(p.name)) { person = true; break; } p = p.parent; } if (!person) meshes.push(o); } });
    const down = (x, y, z, far = 3) => { const o = root.localToWorld(V3(x, y, z)), d = root.localToWorld(V3(x, y - 1, z)).sub(o).normalize(); _rc.set(o, d); _rc.far = far;
      const sides = []; for (const m of meshes) { const mt = m.material; if (mt && !Array.isArray(mt) && mt.side !== THREE.DoubleSide) { sides.push([mt, mt.side]); mt.side = THREE.DoubleSide; } }
      try { const h = _rc.intersectObjects(meshes, false)[0]; return h ? root.worldToLocal(h.point.clone()).y : null; } finally { for (const [mt, sd] of sides) mt.side = sd; } };
    const deck = down(w.x, w.y + 0.2, w.z - 0.3) ?? (w.y - 1.0);
    const chair = down(w.x, w.y + 0.2, w.z - 0.62);
    const grips = [{ side: 'Left', p: V3(w.x + 0.15, w.y + 0.05, w.z - 0.04) }, { side: 'Right', p: V3(w.x - 0.15, w.y + 0.05, w.z - 0.04) }];
    if (chair !== null && chair - deck > 0.35 && chair - deck < 0.68) {    // helm chair: seated (a leaning post is taller: stand)
      return { id: 'driver', i: 0, yaw: 0, open: true, recline: 10, doorX: 1.5, roofY: NaN, wheel: null, hip: V3(w.x, chair + 0.1, w.z - 0.6), heel: V3(w.x, deck, w.z - 0.08), grips };
    }
    return { id: 'driver', i: 0, yaw: 0, open: true, standing: true, recline: 3, doorX: 1.5, roofY: NaN, wheel: null, hip: V3(w.x, deck + 0.95, w.z - 0.42), heel: V3(w.x, deck, w.z - 0.36), grips };
  }
  return {
    get seated() { return !!cur; },
    enter(ch, v) {
      try {
        const spec = v?.spec, boat = !!(v?.isBoat || v?.boat || spec?.boat);
        const shell = boat ? v?.mesh : v?.car?.shell;
        if (!ch?.root || !spec || !shell || v.air || spec.bike) return false;
        // boats: the boarding move (climb / hop, boats.js + main.js) plays first; the seat takes over when it ends
        if (boat && game.vehicles?.boatBoarding?.active) { cur = { pending: { ch, v } }; return true; }
        const a = boat ? boatAnchor(v) : anchorOf(v); if (!a) return false;
        // where he stands now (beside the door), in the car's frame: the start of the slide into the seat
        let from = null;
        if (ch.root.parent && ch.root.visible !== false) {
          shell.updateWorldMatrix(true, false);
          const p = ch.root.getWorldPosition(new THREE.Vector3()); const lp = shell.worldToLocal(p.clone());
          ch.root.getWorldQuaternion(_q); const sq = shell.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(_q);
          _e.setFromQuaternion(sq, 'YXZ');
          if (lp.length() < 6) from = { p: lp, yaw: _e.y };
        }
        ch.snapshotPose?.(ENTER_S);
        shell.add(ch.root);
        ch.setVisible?.(true); ch.root.visible = true;
        if (!seatCharacter(ch, a, { role: 'driver', vehicle: v, probe: !boat })) { shell.remove(ch.root); return false; }
        cur = { v, ch, t: from ? 0 : ENTER_S, from, to: ch.root.position.clone(), yaw: a.yaw || 0 };
        if (from) this.update(0);
        return true;
      } catch (e) { console.warn('[seat] enter', e); cur = null; return false; }
    },
    update(dt) {
      if (!cur) return;
      if (cur.ex) { try { this._exitStep(dt * (globalThis.__exitSlow || 1)); } catch (e) { console.warn('[seat] exit step', e); this.exit(); } return; }
      if (cur.pending) { if (!game.vehicles?.boatBoarding?.active) { const { ch, v } = cur.pending; cur = null; if (!this.enter(ch, v)) ch.setVisible?.(false); } return; }
      try {
        if (cur.ch._seat) cur.ch._seat.w = cur.from ? THREE.MathUtils.smoothstep(Math.min(1, cur.t / ENTER_S), 0.15, 1) : 1;
        cur.ch.update(dt, { driving: true, speed: 0, grounded: true });
        if (cur.t < ENTER_S && cur.from) {
          cur.t += dt; const k = THREE.MathUtils.smoothstep(Math.min(1, cur.t / ENTER_S), 0, 1);
          const seat = cur.ch.root.position.clone();   // the solver's seat spot this frame
          // swing in: sideways first (through the door), then down into the seat
          const ks = THREE.MathUtils.smoothstep(k, 0, 0.75), kd = THREE.MathUtils.smoothstep(k, 0.25, 1);
          cur.ch.root.position.set(THREE.MathUtils.lerp(cur.from.p.x, seat.x, ks), THREE.MathUtils.lerp(cur.from.p.y, seat.y, kd), THREE.MathUtils.lerp(cur.from.p.z, seat.z, ks));
          let dy = cur.yaw - cur.from.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          cur.ch.root.rotation.set(0, cur.from.yaw + dy * ks, 0);
          if (cur.t >= ENTER_S) cur.ch.root.rotation.set(0, cur.yaw, 0);
        }
      } catch (e) { /* cosmetic */ }
    },
    get exiting() { return !!cur?.ex; },
    get exitT() { return cur?.ex ? +cur.ex.t.toFixed(3) : null; },
    /** where the camera should follow during an exit (world; y = the ground the pivot hangs from) */
    get exitFollow() { return cur?.ex?.follow || null; },
    /** start the step-out sequence to `spot` (world, on the ground) ending facing `heading` (world yaw). false = not started
     *  (boats, bikes, still entering, flag off): the caller uses exit(). */
    exitTo(spot, heading, opts = {}) {
      const why = (r) => { globalThis.__exitWhy = r; return false; };
      if (!R4EXIT || !cur || cur.pending || cur.ex || !cur.ch?._seat || !spot) return why(!R4EXIT ? 'flag' : !cur ? 'not seated' : 'state');
      if (cur.from && cur.t < ENTER_S) return why('entering');
      const v = cur.v, ch = cur.ch, S = ch._seat, A0 = S.anchor;
      if (v?.isBoat || v?.boat || v?.spec?.boat || v?.spec?.bike || v?.air) return why('boat/bike');
      const shell = ch.root.parent; if (!shell || !A0?.hip) return why('no shell');
      try {
        shell.updateWorldMatrix(true, false);
        const sl = shell.worldToLocal(spot.clone());
        const hipSeat = (S.hip || A0.hip).clone(); hipSeat.z += S.slide || 0; hipSeat.y -= S.sink || 0;
        const sgH = Math.sign(hipSeat.x) || 1;
        const sg = Math.abs(sl.x) > 0.5 ? Math.sign(sl.x) : sgH;
        const doorX = Number.isFinite(A0.doorX) ? A0.doorX : 0.82;
        if (sl.y > hipSeat.y + 0.5) return why('roof spot');                 // exit spot on the roof (boxed in): the old exit
        // leg length (pose independent) for the standing hip height at the end of the rise
        const B = (n) => ch.getBone?.(n);
        const LU = B('LeftUpLeg'), LL = B('LeftLeg'), LF = B('LeftFoot'); if (!LU || !LL || !LF) return false;
        const _a = new THREE.Vector3(), _b = new THREE.Vector3();
        const legLen = (LU.getWorldPosition(_a).distanceTo(LL.getWorldPosition(_b)) + LL.getWorldPosition(_a).distanceTo(LF.getWorldPosition(_b))) / Math.max(1e-3, shell.getWorldScale(_a).y);
        const scale = S.scale || 1, gy = sl.y;
        const recline0 = (S.fixRecline ?? A0.recline ?? S.recline ?? 16) + (S.extraRecline || 0) - (S.reachLean || 0);
        // the anchor this exit drives (a copy: the car's cached anchor stays untouched)
        const Aw = { ...A0, hip: hipSeat.clone(), heel: A0.heel.clone(), wheel: null, grips: null, standing: false, yaw: A0.yaw || 0 };
        const tall = hipSeat.y - gy > 0.95;
        const across = sg !== sgH;
        const ex = {
          spot: spot.clone(), heading, sl, sg, doorX, gy, legLen, scale, tall, across, Aw, A0, onDone: opts.onDone || null, t: 0,
          chin0: S.chin || 0, recline0, yaw0: A0.yaw || 0,
          hip0: hipSeat.clone(), heel0: A0.heel.clone(),
          dAcross: across ? EX.across : 0, dSwing: EX.swing, dRise: tall ? EX.riseTall : EX.rise,
          arms: null, armT: 0,
          carC: opts.carCenter ? opts.carCenter.clone() : null,
          follow: new THREE.Vector3(),
        };
        ex.tStep0 = ex.dAcross + ex.dSwing + ex.dRise;
        S.anchor = Aw; S.hip = null; S.slide = 0; S.sink = 0; S.extraRecline = 0; S.reachLean = 0; S.open = true; S.fixRecline = recline0; S.w = 1;
        // the hands leave the wheel: cross-fade the arm bones from the wheel grip into the new (hands on the thighs) solve
        ex.arms = ARM_BONES.map((n) => B(n)).filter(Boolean).map((b) => ({ b, q: b.quaternion.clone() }));
        cur.ex = ex; globalThis.__exitWhy = 'started' + (across ? ' across' : '');
        ex.follow.copy(ex.carC || spot);
        this.update(0);
        return true;
      } catch (e) { console.warn('[seat] exitTo', e); if (cur) cur.ex = null; return false; }
    },
    _exitStep(dt) {
      const ex = cur.ex, ch = cur.ch, S = ch._seat, Aw = ex.Aw;
      ex.t += dt; const T = ex.t;
      // camera: the pivot glides from the car's center to the exit spot (height from the car's pivot down to standing)
      { const kc = ss(Math.min(1, T / (ex.tStep0 + 0.18)), 0, 1); const c = ex.carC || ex.spot;
        ex.follow.set(lerp(c.x, ex.spot.x, kc), lerp(c.y + 0.05, ex.spot.y, kc), lerp(c.z, ex.spot.z, kc)); }
      if (S && T < ex.tStep0) {
        const sg = ex.sg, dX = ex.doorX, gy = ex.gy;
        let hip0 = ex.hip0, heel0 = ex.heel0;
        let hip, heel, yaw = ex.yaw0, recline = ex.recline0, base = 'drive';
        if (ex.across) {   // slide across the bench / console to the other front seat first
          const hipM = new THREE.Vector3(-hip0.x, hip0.y + 0.02, hip0.z), heelM = new THREE.Vector3(-heel0.x, heel0.y, heel0.z);
          if (T < ex.dAcross) {
            const k = ss(T / ex.dAcross, 0, 1);
            hip = new THREE.Vector3().lerpVectors(hip0, hipM, k); hip.y += Math.sin(k * Math.PI) * 0.07;
            heel = new THREE.Vector3().lerpVectors(heel0, heelM, ss(T / ex.dAcross, 0.15, 1)); heel.y += Math.sin(k * Math.PI) * 0.06;
            recline = lerp(ex.recline0, 4, Math.sin(k * Math.PI));
          }
          hip0 = hipM; heel0 = heelM;
        }
        const t1 = T - ex.dAcross;
        // swing: seated where he sat (the head stays under the roof), turned ~80 degrees toward the door, feet out on the
        // ground beside the sill; then (rise, first 40 %) he leans out and slides onto the sill, his head out of the door
        // opening under the roof rail; then he stands up over his feet
        const hip1 = new THREE.Vector3(hip0.x + sg * 0.05, hip0.y + 0.01, hip0.z - 0.03);
        const hipS = new THREE.Vector3(sg * (dX + 0.06), hip0.y + 0.03, hip0.z - 0.03);
        const heelOut = new THREE.Vector3(sg * (dX + 0.36), gy, hip0.z + 0.06);
        const yaw1 = sg * 80 * Math.PI / 180;
        // standing beside the door: hips out over the feet at standing height
        const hStand = ex.legLen * 0.9 + 0.075 * ex.scale;
        const hip2 = new THREE.Vector3(sg * (dX + 0.32), gy + hStand, hip0.z - 0.02);
        const heel2 = new THREE.Vector3(sg * (dX + 0.4), gy, hip0.z + 0.02);
        let yaw2 = ex.yawOut; if (yaw2 === undefined) {
          // final facing in the car's frame (from the world heading)
          const sq = cur.ch.root.parent.getWorldQuaternion(new THREE.Quaternion()); const e = new THREE.Euler().setFromQuaternion(sq, 'YXZ');
          let y = ex.heading - e.y; y = Math.atan2(Math.sin(y), Math.cos(y)); if (Math.sign(y) !== sg) y = sg * Math.PI / 2; yaw2 = ex.yawOut = y; }
        if (t1 >= 0 && t1 < ex.dSwing) {
          const k = ss(t1 / ex.dSwing, 0, 1);
          hip = new THREE.Vector3().lerpVectors(hip0, hip1, k);
          // heel: up out of the footwell, over the sill, down outside (quadratic arc)
          const kh = ss(t1 / ex.dSwing, 0.05, 1), c = new THREE.Vector3(sg * (dX - 0.02), Math.max(heel0.y, gy) + 0.34, (heel0.z + heelOut.z) * 0.5);
          heel = new THREE.Vector3().copy(heel0).multiplyScalar((1 - kh) * (1 - kh)).addScaledVector(c, 2 * kh * (1 - kh)).addScaledVector(heelOut, kh * kh);
          yaw = lerp(ex.yaw0, yaw1, ss(t1 / ex.dSwing, 0, 0.9));
          recline = lerp(ex.recline0, Math.min(ex.recline0, 8), k);
        } else if (t1 >= ex.dSwing) {
          const k = Math.min(1, (t1 - ex.dSwing) / ex.dRise);
          const ka = ss(Math.min(1, k / 0.4), 0, 1), kb = ss(Math.max(0, (k - 0.32) / 0.68), 0, 1);
          hip = new THREE.Vector3().lerpVectors(hip1, hipS, ka);
          hip.lerp(hip2, kb);
          heel = new THREE.Vector3().lerpVectors(heelOut, heel2, ss(k, 0.5, 1));
          yaw = lerp(yaw1, yaw2, ss(k, 0.35, 1));
          // lean out (head through the door opening, low), then upright as the legs take the weight
          recline = k < 0.4 ? lerp(Math.min(ex.recline0, 8), -32, ka) : lerp(-32, -3, ss((k - 0.4) / 0.6, 0, 1));
          base = 'stand';
        }
        if (hip) Aw.hip.copy(hip); if (heel) Aw.heel.copy(heel);
        Aw.yaw = yaw; S.fixRecline = recline; S.chin = ex.chin0 * Math.max(0, 1 - Math.max(0, T - ex.dAcross - ex.dSwing) / (ex.dRise * 0.5));
        ch.root.rotation.set(0, yaw, 0);
        S.lastQs = null;
        if (base === 'drive') ch.update(dt, { driving: true, speed: 0, grounded: true });
        else { ch.update(dt, { driving: false, speed: 0, grounded: true }); S.lastQs = null; solveSeat(ch, dt); }
        // arms: cross-fade off the wheel over the first 0.25 s
        if (ex.arms) { ex.armT += dt; const k = ss(Math.min(1, ex.armT / 0.25), 0, 1);
          if (k >= 1) ex.arms = null; else for (const a of ex.arms) { const solved = a.b.quaternion.clone(); a.b.quaternion.slerpQuaternions(a.q, solved, k); } }
        return;
      }
      // the step: off the seat solver, walk the last bit to the exit spot (the clip cross-fades from the standing pose)
      if (!ex.stepping) {
        ex.stepping = true;
        const root = ch.root, w = root.getWorldPosition(new THREE.Vector3()), q = root.getWorldQuaternion(new THREE.Quaternion());
        const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
        unseatCharacter(ch); ch.snapshotPose?.(0.22);
        game.scene.add(root); root.position.copy(w); root.rotation.set(0, e.y, 0);
        ex.w0 = w; ex.yawW0 = e.y; ex.tS = 0;
        const d = Math.hypot(ex.spot.x - w.x, ex.spot.z - w.z);
        ex.dStep = Math.min(1.2, EX.step + Math.max(0, d - 0.6) / 1.4); ex.stepV = d / ex.dStep;
      }
      ex.tS += dt; const k = Math.min(1, ex.tS / ex.dStep), kk = ss(k, 0, 1);
      const root = ch.root;
      root.position.set(lerp(ex.w0.x, ex.spot.x, k), lerp(ex.w0.y, ex.spot.y, kk), lerp(ex.w0.z, ex.spot.z, k));
      let dy = ex.heading - ex.yawW0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      root.rotation.set(0, ex.yawW0 + dy * kk, 0);
      const sp = ex.stepV * Math.sin(Math.PI * Math.min(1, k * 0.9 + 0.1)) * 1.3;
      ch.update(dt, { speed: Math.max(0.5, sp), groundSpeed: Math.max(0.5, sp), grounded: true, driving: false });
      if (k >= 1) { const done = ex.onDone; cur = null; try { done?.(); } catch (e) { console.warn('[seat] exit done', e); } }
    },
    exit() {
      if (!cur) return;
      if (cur.ex) { const done = cur.ex.onDone; try { if (cur.ch._seat) unseatCharacter(cur.ch); if (cur.ch.root.parent !== game.scene) { const w = cur.ch.root.getWorldPosition(new THREE.Vector3()); game.scene.add(cur.ch.root); cur.ch.root.position.copy(w); } cur.ch.root.rotation.set(0, 0, 0); } catch (e) { /* ignore */ } cur = null; try { done?.(); } catch (e) { /* ignore */ } return; }
      if (cur.pending) { cur = null; return; }
      try { cur.ch.snapshotPose?.(0.14); unseatCharacter(cur.ch); game.scene.add(cur.ch.root); cur.ch.root.rotation.set(0, 0, 0); } catch (e) { /* ignore */ }
      cur = null;
    },
  };
}

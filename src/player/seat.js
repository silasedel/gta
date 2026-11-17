import * as THREE from 'three';
import { seatCharacter, unseatCharacter } from '../npc/seat.js';
// Southline — the player visibly sits in the driver's seat of cars, posed by the shared seat solver (src/npc/seat.js) on the
// car's measured seat anchor (r2-cars: v.seatAnchor(0), shell space): hips on the H-point, hands on the wheel, feet on the
// pedals, head under the roof. Entering slides him from the door into the seat while the pose blends; leaving blends the
// seated pose back out. Hidden as before for boats, bikes, aircraft or anything without a car shell. enter() returns
// false when it did not seat him (the caller hides him then).
const ENTER_S = 0.55;
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
    exit() {
      if (!cur) return;
      if (cur.pending) { cur = null; return; }
      try { cur.ch.snapshotPose?.(0.4); unseatCharacter(cur.ch); game.scene.add(cur.ch.root); cur.ch.root.rotation.set(0, 0, 0); } catch (e) { /* ignore */ }
      cur = null;
    },
  };
}

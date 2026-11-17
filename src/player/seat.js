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
  return {
    get seated() { return !!cur; },
    enter(ch, v) {
      try {
        const spec = v?.spec, shell = v?.car?.shell;
        if (!ch?.root || !spec || !shell || v.boat || v.isBoat || v.air || spec.bike || spec.boat) return false;
        const a = anchorOf(v); if (!a) return false;
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
        if (!seatCharacter(ch, a, { role: 'driver', vehicle: v })) return false;
        cur = { v, ch, t: from ? 0 : ENTER_S, from, to: ch.root.position.clone(), yaw: a.yaw || 0 };
        if (from) this.update(0);
        return true;
      } catch (e) { console.warn('[seat] enter', e); cur = null; return false; }
    },
    update(dt) {
      if (!cur) return;
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
      try { cur.ch.snapshotPose?.(0.4); unseatCharacter(cur.ch); game.scene.add(cur.ch.root); cur.ch.root.rotation.set(0, 0, 0); } catch (e) { /* ignore */ }
      cur = null;
    },
  };
}

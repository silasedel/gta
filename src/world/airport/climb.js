// GTA-style fence climbing: press Space (jump) while facing a chain-link fence within reach and Nico jumps up, grabs the
// mesh, climbs hand over hand, swings a leg over the top and drops down on the far side. Scripted move (player.script, the
// capsule collider off for the move, like src/player/vault.v2.js); the pose is layered on top of the jump clip by bone
// rotations after the character update (game.updaters run after main.js updates the character).
//   fences: [{ nearest(x, z, maxD) -> { x, z, nx, nz, y, d, height } }]
import * as THREE from 'three';

const REACH = 1.1;
const ease = (k) => k * k * (3 - 2 * k);

export function createClimb(game, fences) {
  const P = game.player;
  const S = { move: null, char: null, bones: null, stats: { climbs: 0 } };
  function probe() {
    if (!P || P.state.inVehicle || P.script || P.swimming || P.ragdoll || !P.state.grounded)
      return null;
    const p = P.position,
      hx = Math.sin(P.heading),
      hz = Math.cos(P.heading);
    for (const f of fences()) {
      const n = f.nearest(p.x, p.z, REACH + 0.3);
      if (!n || n.climbable === false) continue; // W6: the base fence only at its climb spots
      const tx = n.x - p.x,
        tz = n.z - p.z,
        d = Math.hypot(tx, tz) || 1e-3;
      if ((tx * hx + tz * hz) / d < 0.55 && d > 0.25) continue; // must face the fence
      // which way over: away from the side he stands on
      const side = (p.x - n.x) * n.nx + (p.z - n.z) * n.nz >= 0 ? 1 : -1; // +1 = outside
      const ox = -n.nx * side,
        oz = -n.nz * side; // crossing direction
      const land = { x: n.x + ox * 0.75, z: n.z + oz * 0.75 };
      land.y = game.city?.groundHeightAt?.(land.x, land.z) ?? n.y;
      if (game.city?.isWater?.(land.x, land.z)) continue;
      return {
        fence: n,
        ox,
        oz,
        land,
        top: n.y + (n.top ?? 2.2),
        start: p.clone(),
        heading: Math.atan2(ox, oz),
        toAirside: side > 0,
      };
    }
    return null;
  }
  function start(c) {
    S.move = { c, t: 0, dur: 2.55 + Math.max(0, c.top - c.start.y - 2.2) * 0.9 }; // taller fences take longer
    try {
      P.collider?.setEnabled(false);
    } catch (e) {
      /* */
    }
    P.heading = c.heading;
    P.script = {
      lock: true,
      climb: true,
      fixed() {},
      anim: { speed: 0, grounded: false, jumping: true, sprint: false },
      pose: (dt, ch) => {
        S.char = ch;
      },
    };
    S.stats.climbs++;
    game.emit?.('playerClimb', {
      kind: 'fence',
      toAirside: c.toAirside,
      x: c.fence.x,
      z: c.fence.z,
    });
    try {
      game.audio?.play?.('climb', { position: P.position, volume: 0.6 });
    } catch (e) {
      /* */
    }
  }
  // phases: 0..0.16 jump + grab, 0.16..0.62 climb, 0.62..0.8 over the top, 0.8..1 drop
  function fixed(dt) {
    const m = S.move;
    if (!m) return;
    m.t += dt;
    const k = Math.min(1, m.t / m.dur),
      c = m.c,
      f = c.fence,
      st = c.start;
    const wallX = f.x - c.ox * 0.38,
      wallZ = f.z - c.oz * 0.38; // hanging on the near face
    let x, y, z;
    if (k < 0.16) {
      const e = ease(k / 0.16);
      x = st.x + (wallX - st.x) * e;
      z = st.z + (wallZ - st.z) * e;
      y = st.y + Math.sin((e * Math.PI) / 2) * 0.75;
    } else if (k < 0.62) {
      const e = (k - 0.16) / 0.46,
        steps = e * 3;
      const stepE = Math.floor(steps) + ease(steps % 1);
      y = st.y + 0.75 + (c.top - 1.35 - st.y - 0.75) * (stepE / 3);
      x = wallX;
      z = wallZ;
    } else if (k < 0.8) {
      const e = ease((k - 0.62) / 0.18);
      x = wallX + c.ox * 0.76 * e;
      z = wallZ + c.oz * 0.76 * e;
      y = c.top - 1.35 + Math.sin(e * Math.PI) * 0.55 + e * 0.0;
    } else {
      const e = (k - 0.8) / 0.2;
      x = wallX + c.ox * (0.76 + 0.35 * e);
      z = wallZ + c.oz * (0.76 + 0.35 * e);
      y = c.top - 1.35 + (c.land.y - (c.top - 1.35)) * (e * e);
    }
    m.phase = k < 0.16 ? 'grab' : k < 0.62 ? 'climb' : k < 0.8 ? 'over' : 'drop';
    m.k = k;
    try {
      game.movePlayerTo(x, y, z);
    } catch (e) {
      /* */
    }
    P.heading = c.heading;
    P.state.grounded = false;
    if (P.script?.anim) {
      const a = P.script.anim;
      a.jumping = true;
      a.grounded = false;
      a.speed = 0;
    } // the jump clip is the base; poseUpdate layers the climb on it
    if (k >= 1) {
      S.move = null;
      if (P.script?.climb) P.script = null;
      try {
        P.collider?.setEnabled(true);
      } catch (e) {
        /* */
      }
      P.state.grounded = true;
      P.state.jumping = false;
      game.emit?.('playerClimbed', { toAirside: c.toAirside });
    }
  }
  // bone layer: arms up on the mesh (alternating pulls), knees up, a leg swung over at the top
  const Q = new THREE.Quaternion(),
    E = new THREE.Euler();
  function findBones(ch) {
    const root = ch?.root;
    if (!root) return null;
    const b = {};
    root.traverse((o) => {
      if (!o.isBone) return;
      const n = o.name.replace(/^mixamorig:?/i, '');
      if (
        /^(LeftArm|RightArm|LeftForeArm|RightForeArm|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg|Spine1?)$/.test(
          n,
        ) &&
        !b[n]
      )
        b[n] = o;
    });
    return b.LeftArm && b.RightArm ? b : null;
  }
  const rot = (bone, x, y, z) => {
    if (!bone) return;
    E.set(x, y, z);
    Q.setFromEuler(E);
    bone.quaternion.multiply(Q);
  };
  function poseUpdate() {
    const m = S.move;
    if (!m || !S.char) return;
    if (!S.bones || S.bones._root !== S.char.root) {
      S.bones = findBones(S.char);
      if (S.bones) S.bones._root = S.char.root;
    }
    const b = S.bones;
    if (!b) return;
    // tuned on Nico's rig (live session, Nov 19): +x on the arm bones lifts the arm forward / up, -x on an up-leg lifts the
    // thigh, +x on a leg bends the knee. Hand over hand: the arms swap high / low three times while he goes up.
    const k = m.k || 0,
      w = k < 0.08 ? k / 0.08 : k > 0.92 ? (1 - k) / 0.08 : 1;
    const climbing = k >= 0.16 && k < 0.62,
      over = k >= 0.62 && k < 0.8,
      drop = k >= 0.8;
    const cyc = climbing ? Math.sin(((k - 0.16) / 0.46) * Math.PI * 3) : 0,
      hi = 0.5 + 0.5 * cyc;
    let la, ra, lf, rf, lu, ll, ru, rl;
    if (k < 0.16) {
      la = ra = 2.3;
      lf = rf = 0.6;
      lu = -0.8;
      ll = 1.2;
      ru = -0.4;
      rl = 0.8;
    } // jump and grab
    else if (climbing) {
      la = 1.6 + 0.8 * hi;
      ra = 2.4 - 0.8 * hi;
      lf = 0.9 - 0.4 * hi;
      rf = 0.5 + 0.4 * hi;
      lu = -0.5 - 0.8 * (1 - hi);
      ll = 1.0 + 0.8 * (1 - hi);
      ru = -0.5 - 0.8 * hi;
      rl = 1.0 + 0.8 * hi;
    } else if (over) {
      la = ra = 1.7;
      lf = rf = 0.7;
      lu = -1.7;
      ll = 1.3;
      ru = -0.3;
      rl = 0.6;
    } // hands on the rail, a leg swung over
    else {
      const e = (k - 0.8) / 0.2;
      la = ra = 1.5 - 1.2 * e;
      lf = rf = 0.5;
      lu = -0.9 + 0.6 * e;
      ll = 1.1 - 0.6 * e;
      ru = -0.6 + 0.4 * e;
      rl = 0.9 - 0.5 * e;
    } // drop and land
    rot(b.LeftArm, la * w, 0, 0);
    rot(b.RightArm, ra * w, 0, 0);
    rot(b.LeftForeArm, lf * w, 0, 0);
    rot(b.RightForeArm, rf * w, 0, 0);
    rot(b.LeftUpLeg, lu * w, 0, 0);
    rot(b.LeftLeg, ll * w, 0, 0);
    rot(b.RightUpLeg, ru * w, 0, 0);
    rot(b.RightLeg, rl * w, 0, 0);
    void drop;
  }
  return {
    probe,
    start,
    fixed,
    poseUpdate,
    stats: S.stats,
    get active() {
      return !!S.move;
    },
    get phase() {
      return S.move?.phase || null;
    },
    tryClimb() {
      if (S.move || game.ui?.paused || game.ui?.phoneOpen) return false;
      const c = probe();
      if (!c) return false;
      start(c);
      return true;
    },
  };
}

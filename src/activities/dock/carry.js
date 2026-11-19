// Carrying a box with both hands: the box floats in front of the player's chest (following the body's yaw and the walk
// bob of the hips) and both arms reach for its sides by two-bone IK on the player's own arm bones. Runs after the
// character animation (game.updaters run after main.js poses the player), so the walk cycle keeps the legs.
import * as THREE from 'three';
import { twoBone } from '../jetski/rider.js';

const _v = new THREE.Vector3(),
  _h = new THREE.Vector3();
export function carryPose(game, box, o = {}) {
  const ch = game.playerCharacter;
  if (!ch?.root || !box) return;
  const B = (n) => ch.getBone?.(n);
  const hips = B('Hips'),
    root = ch.root;
  root.updateWorldMatrix(true, false);
  const yaw = new THREE.Euler().setFromQuaternion(
    root.getWorldQuaternion(new THREE.Quaternion()),
    'YXZ',
  ).y;
  const fx = Math.sin(yaw),
    fz = Math.cos(yaw),
    lx = Math.cos(yaw),
    lz = -Math.sin(yaw);
  const hy = hips ? hips.getWorldPosition(_h).y : root.position.y + 1.0;
  const base = root.getWorldPosition(_v);
  const fwd = o.fwd ?? 0.36,
    up = o.up ?? 0.26,
    half = o.half ?? 0.27;
  box.position.set(base.x + fx * fwd, hy + up, base.z + fz * fwd);
  box.rotation.set(0, yaw, 0);
  box.updateMatrixWorld(true);
  for (const [side, sg] of [
    ['Left', 1],
    ['Right', -1],
  ]) {
    const U = B(side + 'Arm'),
      F = B(side + 'ForeArm'),
      Hn = B(side + 'Hand');
    if (!U || !F || !Hn) continue;
    const tgt = new THREE.Vector3(
      base.x + fx * (fwd - 0.02) + lx * sg * half,
      hy + up + 0.14,
      base.z + fz * (fwd - 0.02) + lz * sg * half,
    );
    const pole = new THREE.Vector3(
      base.x + lx * sg * 0.9 - fx * 0.3,
      hy - 0.4,
      base.z + lz * sg * 0.9 - fz * 0.3,
    );
    twoBone(U, F, Hn, tgt, pole);
  }
}

// Southline — Mari's arms-down shoulder correction (tools/v2/player/corrective.py). Her scan stood arms down; bound in
// the T-pose, plain skinning brought the arms back down with stretched deltoids and pinched armpits. The build stores
// the scan's own shoulder shape as morph targets 'armDownL' / 'armDownR'; this blends each one in as that upper arm
// hangs near the calibration direction (meta.corrective, model space), and out as the arm rises (aiming, driving).
import * as THREE from 'three';

const FULL = Math.cos(THREE.MathUtils.degToRad(14)); // within 14 degrees of the scan's arm: full correction
const NONE = Math.cos(THREE.MathUtils.degToRad(60)); // 60 degrees or more away: none

export function createShoulderCorrective({ model, mesh, meta }) {
  const dict = mesh?.morphTargetDictionary;
  const cal = meta?.corrective;
  if (!dict || !cal || dict.armDownL === undefined || dict.armDownR === undefined) return null;
  const bone = (n) =>
    model.getObjectByName('mixamorig' + n) || model.getObjectByName('mixamorig:' + n);
  const sides = [
    {
      arm: bone('LeftArm'),
      fore: bone('LeftForeArm'),
      cal: new THREE.Vector3(...cal.L),
      key: dict.armDownL,
    },
    {
      arm: bone('RightArm'),
      fore: bone('RightForeArm'),
      cal: new THREE.Vector3(...cal.R),
      key: dict.armDownR,
    },
  ].filter((s) => s.arm && s.fore);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const q = new THREE.Quaternion();
  return {
    // after every bone edit of the frame (clips, relaxed stance, IK)
    update() {
      model.getWorldQuaternion(q).invert();
      for (const s of sides) {
        s.arm.getWorldPosition(a);
        s.fore.getWorldPosition(b);
        const d = b.sub(a).applyQuaternion(q).normalize();
        const t = THREE.MathUtils.clamp((d.dot(s.cal) - NONE) / (FULL - NONE), 0, 1);
        mesh.morphTargetInfluences[s.key] = t * t * (3 - 2 * t);
      }
    },
  };
}

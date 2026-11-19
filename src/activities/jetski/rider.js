// Rider legs on a jet ski: the player seat solver (src/player/seat.js) poses a car-style seated driver with the feet
// together under the handlebar. A jet ski is straddled: this pass runs after the seat solve (game.updaters run after
// main.js updates the seat) and moves each foot into its footwell beside the deck body with the knees out, by a small
// two-bone IK on the player's own leg bones. Nothing is written when the player is not on one of our skis.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const wp = (o, v) => { o.updateWorldMatrix(true, false); return v.setFromMatrixPosition(o.matrixWorld); };
// rotate bone `bone` (in world space) so that world vector `from` turns into `to`
function swing(bone, from, to) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(_q2);
  _q2.premultiply(_q);
  const par = bone.parent; if (par) { par.getWorldQuaternion(_q3); _q3.invert(); _q2.premultiply(_q3); }
  bone.quaternion.copy(_q2); bone.updateMatrixWorld(true);
}
export function twoBone(a, b, c, target, pole) {
  const pa = wp(a, new THREE.Vector3()), pb = wp(b, new THREE.Vector3()), pc = wp(c, new THREE.Vector3());
  const l1 = pa.distanceTo(pb), l2 = pb.distanceTo(pc);
  const t = _t.copy(target).sub(pa); let d = t.length();
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999); t.setLength(d);
  const dir = _d.copy(t).normalize();
  const pv = _p.copy(pole).sub(pa); pv.addScaledVector(dir, -pv.dot(dir)); if (pv.lengthSq() < 1e-8) return; pv.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const knee = _e.copy(pa).addScaledVector(dir, l1 * cosA).addScaledVector(pv, l1 * sinA);
  swing(a, _a.copy(pb).sub(pa), _b.copy(knee).sub(pa));
  wp(b, pb); wp(c, pc);
  swing(b, _a.copy(pc).sub(pb), _b.copy(pa).add(t).sub(pb));
}

/** pose the legs of character `ch` riding the ski whose visual root is `shell` (boat frame: +x port, +z bow) */
export function straddle(ch, shell, floorY, lean = 0) {
  const B = (n) => ch.getBone?.(n);
  shell.updateWorldMatrix(true, false);
  for (const [side, sg] of [['Left', 1], ['Right', -1]]) {
    const U = B(side + 'UpLeg'), Lg = B(side + 'Leg'), F = B(side + 'Foot'); if (!U || !Lg || !F) continue;
    // heel in the footwell: 36 cm out from the centerline, a little behind the handlebar, on the floor (+ ankle height)
    const tgt = shell.localToWorld(_c.set(sg * (0.355 + lean * sg * 0.03), floorY + 0.09, -0.12));
    const hip = wp(U, new THREE.Vector3());
    const pole = shell.localToWorld(new THREE.Vector3(sg * 0.9, floorY + 0.9, 0.9));
    void hip;
    twoBone(U, Lg, F, tgt.clone(), pole);
    // foot flat on the floor, toes forward
    const T = B(side + 'ToeBase');
    if (T) { const toe = wp(T, new THREE.Vector3()), heel = wp(F, new THREE.Vector3()); const want = shell.localToWorld(new THREE.Vector3(sg * 0.36, floorY + 0.03, 0.06)).sub(heel); swing(F, toe.sub(heel), want); }
  }
}

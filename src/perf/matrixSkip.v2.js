// perf (Nov 19, driving fps): three.js recomposes every object's local matrix from position / quaternion / scale every
// frame (matrixAutoUpdate) and, because that marks it dirty, multiplies every world matrix of the whole scene graph again.
// Downtown that is ~11,600 objects a frame, of which ~1,900 actually moved over a second (scene census,
// tools/v2/scene-census.mjs); updateMatrixWorld + multiplyMatrices were ~10% of the main thread while driving (CPU profile).
// This keeps three's own dirty-flag logic and only skips the compose when position, quaternion, scale and parent are the
// same as at the last compose. A changed parent still forces its whole subtree, exactly as before.
// ?mskip=0 turns it off (old behavior).
import * as THREE from 'three';

export const order = 1;

export function installMatrixSkip() {
  if (typeof location !== 'undefined' && /[?&]mskip=0\b/.test(location.search)) return false;
  const P = THREE.Object3D.prototype;
  if (P._psMatrixSkip) return true;
  P._psMatrixSkip = true;
  P.updateMatrixWorld = function updateMatrixWorld(force) {
    if (this.matrixAutoUpdate) {
      const p = this.position,
        q = this.quaternion,
        s = this.scale;
      let c = this._psMC;
      if (
        c === undefined ||
        this._psMP !== this.parent ||
        c[0] !== p.x ||
        c[1] !== p.y ||
        c[2] !== p.z ||
        c[3] !== q._x ||
        c[4] !== q._y ||
        c[5] !== q._z ||
        c[6] !== q._w ||
        c[7] !== s.x ||
        c[8] !== s.y ||
        c[9] !== s.z
      ) {
        if (c === undefined) c = this._psMC = new Float64Array(10);
        c[0] = p.x;
        c[1] = p.y;
        c[2] = p.z;
        c[3] = q._x;
        c[4] = q._y;
        c[5] = q._z;
        c[6] = q._w;
        c[7] = s.x;
        c[8] = s.y;
        c[9] = s.z;
        this._psMP = this.parent;
        this.updateMatrix();
      }
    }
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.matrixWorldAutoUpdate === true) {
        if (this.parent === null) this.matrixWorld.copy(this.matrix);
        else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) children[i].updateMatrixWorld(force);
  };
  return true;
}

export async function initV2(game) {
  const on = installMatrixSkip();
  if (game) game.matrixSkip = on;
}

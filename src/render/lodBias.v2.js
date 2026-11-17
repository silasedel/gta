// r2-perf: one LOD bias for every distance-LOD system, scaled by the preset and by the dynamic resolution.
//   k = preset bias / render scale. k > 1 switches to the lighter level earlier (as if the object were k times farther);
//   k = 1 is today's behavior exactly. At a render scale below 1 an object covers fewer real pixels, so its LOD error
//   stays under the same pixel budget when the switch distance shrinks by the same factor.
// Systems driven (each only while game.lodBias.on, so High / Ultra at scale 1 are pixel-identical):
//   - THREE.LOD (cars, car covers, props): distance x k in LOD.update
//   - human LOD manager (src/player/characterModel.js LOD_CFG): up1 / down0 / up2 / down1 / far / shadowDist / k
//   - screen-size detail cull (src/render/detailCull.v2.js): mainPx x k, shadowPx x k
// Preset biases: ultra 0.85, high 1, medium 1.3, low 1.6 (PRESET_BIAS). OFF by default: ?lodbias=1 or game.lodBias.on.
// API: game.lodBias = { on, preset, k, PRESET_BIAS, stats }
import * as THREE from 'three';
import { LOD_CFG } from '../player/characterModel.js';

export const order = 8; // after quality.v2.js (6) and tiers.v2.js (7)

export const PRESET_BIAS = { ultra: 0.85, high: 1, medium: 1.3, low: 1.6 };

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

export async function initV2(game) {
  const qs = new URLSearchParams(location.search);
  const B = game.lodBias = { on: qs.get('lodbias') === '1', preset: 1, k: 1, PRESET_BIAS, stats: { lodUpdates: 0 } };
  // base values of the systems we scale (captured once, so the bias never compounds)
  const base = { cfg: LOD_CFG ? { ...LOD_CFG } : null, dc: null };

  // ---- THREE.LOD: same algorithm as three r170, distance scaled by k
  const proto = THREE.LOD.prototype;
  if (!proto.__r2Bias) {
    proto.__r2Bias = true;
    const orig = proto.update;
    proto.update = function update(camera) {
      if (!B.on || B.k === 1) return orig.call(this, camera);
      const levels = this.levels;
      if (levels.length > 1) {
        _v1.setFromMatrixPosition(camera.matrixWorld);
        _v2.setFromMatrixPosition(this.matrixWorld);
        const distance = (_v1.distanceTo(_v2) / camera.zoom) * B.k;
        levels[0].object.visible = true;
        let i, l;
        for (i = 1, l = levels.length; i < l; i++) {
          let d = levels[i].distance;
          if (levels[i].object.visible) d -= d * levels[i].hysteresis;
          if (distance >= d) { levels[i - 1].object.visible = false; levels[i].object.visible = true; } else break;
        }
        this._currentLevel = i - 1;
        for (; i < l; i++) levels[i].object.visible = false;
      }
      B.stats.lodUpdates++;
    };
  }

  let lastK = 1, lastOn = false;
  function apply() {
    const k = B.on ? B.k : 1;
    if (k === lastK && B.on === lastOn) return;
    lastK = k; lastOn = B.on;
    try {
      if (LOD_CFG && base.cfg) for (const key of ['up1', 'down0', 'up2', 'down1', 'far', 'shadowDist']) if (Number.isFinite(base.cfg[key])) LOD_CFG[key] = base.cfg[key] / k;
    } catch (e) { /* character module missing */ }
    try {
      const dc = game.detailCull;
      if (dc) {
        if (!base.dc) base.dc = { mainPx: dc.mainPx, shadowPx: dc.shadowPx };
        dc.mainPx = base.dc.mainPx * k; dc.shadowPx = base.dc.shadowPx * k;
      }
    } catch (e) { /* */ }
  }
  game.on?.('quality:changed', (d) => { B.preset = PRESET_BIAS[d?.name] ?? 1; });
  B.preset = PRESET_BIAS[game.quality?.name] ?? 1;
  game.updaters.push(function lodBiasTick() {
    const s = Math.max(0.5, Math.min(1, game.post?.renderScale ?? 1));
    // quantized so the systems are not re-written every frame
    B.k = Math.round((B.preset / s) * 20) / 20;
    apply();
  });
}

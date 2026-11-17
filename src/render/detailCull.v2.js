// Stage 1 performance: screen-size detail culling for the main view and the shadow pass.
// three.js tests every mesh against the view frustum only. Thousands of small props (bottles, pots, railings, cables) are
// still drawn when they cover a pixel or two, and are drawn again into the shadow map where their shadow is invisible.
// This patches Frustum.intersectsObject (used by both the main render and WebGLShadowMap) to also reject:
//   - main view: objects whose bounding sphere spans less than ~MAIN_PX pixels on screen;
//   - shadow pass: objects whose shadow would span less than ~SHADOW_PX pixels (or that sit beyond the shadow range).
// Skipped: instanced meshes (their sphere covers every instance), skinned meshes, sprites, objects with
// userData.noDetailCull, and anything while game.detailCull.on is false. Cost: one sphere transform per test (three.js
// does the same work inside the frustum test).
// API: game.detailCull = { on, mainPx, shadowPx, stats: { main, shadow } }
import * as THREE from 'three';

export const order = 4;

const S = new THREE.Sphere();
const camPos = new THREE.Vector3();
let pxPerRad = 1000;       // screen pixels per radian at the view center (updated each frame from the camera)
let inShadow = false;
let active = false;          // only while the renderer draws the game camera's view (never post quads or other cameras)

export async function initV2(game) {
  const cfg = game.detailCull = { on: true, mainPx: 1.6, shadowPx: 10, shadowFar: 180, stats: { main: 0, shadow: 0 } };
  const proto = THREE.Frustum.prototype;
  if (proto.__detailCull) return;
  const orig = proto.intersectsObject;
  proto.__detailCull = true;
  proto.intersectsObject = function (object) {
    if (!orig.call(this, object)) return false;
    if (!active || !cfg.on || object.isInstancedMesh || object.isSkinnedMesh || object.userData.noDetailCull) return true;
    const g = object.geometry;
    if (!g) return true;
    if (g.boundingSphere === null) g.computeBoundingSphere();
    S.copy(g.boundingSphere).applyMatrix4(object.matrixWorld);
    const d = Math.max(0.01, S.center.distanceTo(camPos) - S.radius);
    const px = (2 * S.radius / d) * pxPerRad;
    if (inShadow) {
      if (px < cfg.shadowPx || d > cfg.shadowFar + S.radius) { cfg.stats.shadow++; return false; }
    } else if (px < cfg.mainPx) { cfg.stats.main++; return false; }
    return true;
  };
  // only cull inside renderer.render(scene, game.camera) (the shadow pass runs inside it)
  const r = game.renderer, rRender = r.render.bind(r);
  r.render = (scene, camera) => { const was = active; active = camera === game.camera; try { rRender(scene, camera); } finally { active = was; } };
  // flag the shadow pass, and refresh the camera numbers once per frame
  const sm = game.renderer.shadowMap;
  const smRender = sm.render.bind(sm);
  sm.render = (...a) => { inShadow = true; try { smRender(...a); } finally { inShadow = false; } };
  game.updaters.push(function detailCullTick() {
    const cam = game.camera;
    cam.getWorldPosition(camPos);
    const h = game.renderer.domElement.height || 1080;
    pxPerRad = h / (THREE.MathUtils.degToRad(cam.fov || 60));
    cfg.stats.main = 0; cfg.stats.shadow = 0;
  });
}

// Interior art kit: reflection probe. After an interior's light bake is applied, a cube map of the room (interior group only) is
// rendered once from a point in the room, prefiltered by roughness (PMREM), and given to every material that asked for it
// (MatSet.surf(name, { probe: k }), MatSet.flat(c, { probe: k }), or any material through probePatch). The lookup is box-projected
// (parallax-corrected) against the room box, so the neon on the back wall shows up in the right place on the polished floor.
// Cost: one capture (6 small renders + prefilter) per interior build or light-level change; nothing per frame.
import * as THREE from 'three';

const ENV_PARS = THREE.ShaderChunk.envmap_physical_pars_fragment;
const HOOK = 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );';
if (!ENV_PARS.includes(HOOK))
  console.warn('[interiors] probe: envmap chunk changed, box projection disabled');
const BOX = `${HOOK}
		{ vec3 lp = clamp( ( uPrInv * vec4( vPrW, 1.0 ) ).xyz, uPrMin + 0.01, uPrMax - 0.01 ); vec3 ld = mat3( uPrInv ) * reflectVec;
		  ld = vec3( abs( ld.x ) < 1e-4 ? 1e-4 : ld.x, abs( ld.y ) < 1e-4 ? 1e-4 : ld.y, abs( ld.z ) < 1e-4 ? 1e-4 : ld.z );
		  vec3 t1 = ( uPrMax - lp ) / ld, t2 = ( uPrMin - lp ) / ld, tf = max( t1, t2 ); float t = clamp( min( min( tf.x, tf.y ), tf.z ), 0.0, 100.0 );
		  vec3 bp = mat3( uPrW ) * ( lp + ld * t - uPrPos ); float bl = length( bp );
		  if ( bl > 1e-4 && !( any( isnan( bp ) ) || any( isinf( bp ) ) ) ) reflectVec = bp / bl; }`;
const PARS = ENV_PARS.replace(HOOK, BOX);

// uniforms shared by every probe material of one interior
export function probeUniforms() {
  return {
    uPrMin: { value: new THREE.Vector3(-5, 0, -5) },
    uPrMax: { value: new THREE.Vector3(5, 4, 5) },
    uPrPos: { value: new THREE.Vector3(0, 1.5, 0) },
    uPrInv: { value: new THREE.Matrix4() },
    uPrW: { value: new THREE.Matrix4() },
    uPrK: { value: 1 },
  };
}
// patch an onBeforeCompile shader. k = strength multiplier (applied to the reflected radiance)
export function probePatch(sh, U) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader =
    'varying vec3 vPrW;\n' +
    sh.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
	{ vec4 pw = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
	pw = instanceMatrix * pw;
	#endif
	vPrW = ( modelMatrix * pw ).xyz; }`,
    );
  sh.fragmentShader =
    'varying vec3 vPrW;\nuniform vec3 uPrMin;\nuniform vec3 uPrMax;\nuniform vec3 uPrPos;\nuniform mat4 uPrInv;\nuniform mat4 uPrW;\nuniform float uPrK;\n' +
    sh.fragmentShader.replace('#include <envmap_physical_pars_fragment>', PARS);
  return sh;
}

let PM = null,
  PMR = null,
  PH = null,
  PHR = null;
// black prefiltered probe of the final size: probe materials carry it from their first compile, so the real capture is a texture swap
// (same cube-UV size, same shader program) instead of a recompile when it lands
export function probePlaceholder(renderer, size = 256) {
  if (PHR === renderer && PH) return PH;
  PHR = renderer;
  const s = new THREE.Scene();
  s.background = new THREE.Color(0, 0, 0);
  PH = pmremFor(renderer).fromScene(s, 0, 0.1, 10, { size }).texture;
  return PH;
}
// copy pass: a face rendered to a 2D target goes into the cube face with non-finite texels zeroed and HDR clamped (one NaN in a cube
// face would otherwise spread through every rough mip of the prefiltered probe)
let COPY = null;
function copier() {
  if (COPY) return COPY;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null } },
    depthTest: false,
    depthWrite: false,
    vertexShader:
      'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader:
      'uniform sampler2D tSrc; varying vec2 vUv; void main() { vec4 c = texture2D( tSrc, vUv ); if ( any( isnan( c ) ) || any( isinf( c ) ) ) c = vec4( 0.0 ); gl_FragColor = vec4( min( c.rgb, vec3( 24.0 ) ), 1.0 ); }',
  });
  const scene = new THREE.Scene(),
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  COPY = { mat, scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  return COPY;
}
const pmremFor = (renderer) => {
  if (PMR !== renderer) {
    PM?.dispose();
    PM = new THREE.PMREMGenerator(renderer);
    PMR = renderer;
  }
  return PM;
};

// Capture the probe of a built interior, spread over frames: a generator that renders one cube face per step and prefilters on the
// last one. box: { x0, x1, z0, z1, y0, y1 } and probe point { x, y, z } in store-local meters. Returns (as the generator's value)
// the PMREM render target (dispose it with the interior).
export function* probeJob(renderer, store, built, box, at, o = {}) {
  const group = built.group,
    size = o.size || 192;
  const rt = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.HalfFloatType,
      generateMipmaps: false,
    }),
    face2d = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType });
  const cam = new THREE.CubeCamera(0.05, 60, rt),
    tmp = new THREE.Scene(),
    C = copier();
  tmp.background = new THREE.Color(0, 0, 0);
  try {
    // compile this capture's program variants (no scene lights in the capture scene) in the background first
    if (renderer.compileAsync && !o.noPrecompile) {
      let done = false;
      const parent = group.parent,
        wasVis = group.visible,
        prevT = renderer.getRenderTarget();
      try {
        tmp.add(group);
        group.visible = true;
        renderer.setRenderTarget(face2d);
        /* programs are keyed on the target (tone mapping, color space) */ renderer
          .compileAsync(tmp, cam.children[0])
          .then(
            () => {
              done = true;
            },
            () => {
              done = true;
            },
          );
      } catch (e) {
        done = true;
      } finally {
        renderer.setRenderTarget(prevT);
        if (parent) parent.add(group);
        else tmp.remove(group);
        group.visible = wasVis;
      }
      const t0 = performance.now();
      while (!done && performance.now() - t0 < 6000) yield 'compile';
    }
    for (let face = 0; face < 6; face++) {
      const parent = group.parent,
        wasVis = group.visible,
        wp = store.toWorld(at.x, at.z);
      cam.position.set(wp.x, store.baseY + at.y, wp.z);
      cam.updateMatrixWorld(true);
      if (cam.coordinateSystem !== renderer.coordinateSystem) {
        cam.coordinateSystem = renderer.coordinateSystem;
        cam.updateCoordinateSystem();
      }
      const hide = [];
      group.traverse((m) => {
        if ((m.userData?.noProbe || m.material?.userData?.noProbe) && m.visible) {
          hide.push(m);
          m.visible = false;
        }
      });
      const prevTarget = renderer.getRenderTarget(),
        prevFace = renderer.getActiveCubeFace(),
        prevMip = renderer.getActiveMipmapLevel(),
        prevAuto = renderer.autoClear,
        prevClip = renderer.clippingPlanes,
        prevXR = renderer.xr?.enabled;
      try {
        tmp.add(group);
        group.visible = true;
        group.updateMatrixWorld(true);
        renderer.autoClear = true;
        renderer.clippingPlanes = [];
        if (renderer.xr) renderer.xr.enabled = false;
        renderer.setRenderTarget(face2d);
        renderer.render(tmp, cam.children[face]);
        C.mat.uniforms.tSrc.value = face2d.texture;
        renderer.setRenderTarget(rt, face, 0);
        renderer.render(C.scene, C.cam);
      } finally {
        if (parent) parent.add(group);
        else tmp.remove(group);
        group.visible = wasVis;
        for (const m of hide) m.visible = true;
        renderer.setRenderTarget(prevTarget, prevFace, prevMip);
        renderer.autoClear = prevAuto;
        renderer.clippingPlanes = prevClip;
        if (renderer.xr) renderer.xr.enabled = prevXR;
      }
      yield face;
    }
    const env = pmremFor(renderer).fromCubemap(rt.texture);
    const U = built.M.uProbe,
      inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    U.uPrMin.value.set(box.x0, box.y0, box.z0);
    U.uPrMax.value.set(box.x1, box.y1, box.z1);
    U.uPrPos.value.set(at.x, at.y, at.z);
    U.uPrInv.value.copy(inv);
    U.uPrW.value.copy(group.matrixWorld).setPosition(0, 0, 0);
    built.M.setProbe(env.texture);
    return env;
  } finally {
    rt.dispose();
    face2d.dispose();
  }
}
// one-shot capture (all faces now): previews and tools
export function captureProbe(renderer, store, built, box, at, o = {}) {
  const it = probeJob(renderer, store, built, box, at, o);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

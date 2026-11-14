// Interior art kit: atmosphere effects for venues. All cheap: one draw call per effect family, no extra render passes.
// - discoBall(): faceted mirror ball (animated, reflects the room probe) + moving light spots projected on chosen surfaces
// - hazeCone(): additive light shaft under a downlight / pin spot (reads as haze in the air, blooms at the source)
// - flame(): candle / tea-light flame with per-candle flicker (phase rides in the uv), plus flickerLight() for its baked light
import * as THREE from 'three';
import { addLight } from '../lighting.js';
import { lin } from './util.js';

// ---------------------------------------------------------------- disco ball + spots
const SPOT_VS = `varying vec3 vP; varying vec3 vN; void main() { vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const SPOT_FS = `uniform vec3 uBall; uniform float uRot; uniform float uK; uniform float uSize; uniform float uFloor; varying vec3 vP; varying vec3 vN;
float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
void main() {
  vec3 d = vP - uBall; float dist = length( d ); vec3 dir = d / dist; float face = dot( normalize( vN ), -dir ); if ( face <= 0.02 ) discard;
  float c = cos( uRot ), s = sin( uRot ); vec3 r = vec3( c * dir.x - s * dir.z, dir.y, s * dir.x + c * dir.z );
  float th = acos( clamp( r.y, -1.0, 1.0 ) ), rows = 34.0, row = floor( th / 3.14159 * rows ), thc = ( row + 0.5 ) / rows * 3.14159;
  float cols = max( 1.0, floor( 2.0 * rows * sin( thc ) ) ), ph = atan( r.z, r.x ) + 3.14159 + row * 0.37, col = floor( ph / 6.28318 * cols ), phc = ( col + 0.5 ) / cols * 6.28318;
  float rnd = h21( vec2( row, col ) ); if ( rnd < 0.5 ) discard;
  vec3 cc = vec3( sin( thc ) * cos( phc - 3.14159 - row * 0.37 ), cos( thc ), sin( thc ) * sin( phc - 3.14159 - row * 0.37 ) );
  float a = acos( clamp( dot( r, cc ), -1.0, 1.0 ) ), size = uSize * ( 0.7 + 0.6 * fract( rnd * 7.13 ) );
  float spot = smoothstep( size, size * 0.45, a ); if ( spot <= 0.0 ) discard;
  vec3 tint = rnd > 0.9 ? vec3( 1.0, 0.45, 0.9 ) : rnd > 0.82 ? vec3( 0.5, 0.85, 1.0 ) : vec3( 1.0, 0.95, 0.88 );
  float fl = normalize( vN ).y > 0.5 ? uFloor : 1.0; gl_FragColor = vec4( tint * spot * uK * fl * face / ( 0.6 + dist * dist * 0.18 ), 1.0 );
}`;
// ball at (x, y, z) in the current G frame (y = ball center). o: { r, k (spot strength), size (spot angular radius), surfaces: [{ x, y, z, w, h, rx, ry }] }
export function discoBall(ctx, x, y, z, o = {}) {
  const { G, M } = ctx, r = o.r || 0.24, p = G.local(x, y, z);
  // mount: rod from the ceiling + motor
  const chrome = M.flat('#c8ccd2', { rough: 0.2, metal: 1, probe: 1 }); G.cyl(M.flat('#111114', { rough: 0.4 }), x, (y + r + (o.ceil ?? y + 0.8)) / 2, z, 0.008, (o.ceil ?? y + 0.8) - y - r, { seg: 6 }); G.cyl(chrome, x, y + r + 0.04, z, 0.035, 0.06, { seg: 10 });
  // the ball: icosphere facets with a mirror-tile grid, rotates as a dynamic part
  const mirror = M.baked('disco', () => { const m = new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 1, roughness: 0.12, flatShading: true }); return m; }, { probe: 1.6, direct: 0.6 });
  const ball = ctx.dyn(p.x, p.y, p.z, 0, (LG) => { LG.add(mirror, new THREE.IcosahedronGeometry(r, 5)); });
  const U = { uBall: { value: new THREE.Vector3(p.x, p.y, p.z) }, uRot: { value: 0 }, uK: { value: o.k ?? 1.6 }, uSize: { value: o.size ?? 0.012 }, uFloor: { value: o.floor ?? 0.3 } };
  const spots = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SPOT_VS, fragmentShader: SPOT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  spots.userData.order = 6; spots.userData.noProbe = true; ctx.M.owned.push(spots);
  for (const s of o.surfaces || []) G.plane(spots, s.x, s.y, s.z, s.w, s.h, { rx: s.rx || 0, ry: s.ry || 0 });
  const speed = o.speed ?? 0.32, base = U.uK.value;
  ctx.anim.push((dt, t, store) => { const a = t * speed; ball.rotation.y = a; ball.updateMatrix(); U.uRot.value = a; U.uK.value = base * Math.max(0.05, store.built?.levels?.[1] ?? 1); });
  // pin spot on the ball (it is what lights it): small baked spot + the light the ball throws as a soft fill
  addLight(ctx, { p: [x, y, z], c: [0.6, 0.55, 0.6], ch: 1, type: 'omni', soft: 0.5, amb: 0.4, noPool: true });
  return { ball, uniforms: U, material: spots };
}

// ---------------------------------------------------------------- haze cones
const CONE_VS = `varying vec3 vN; varying vec3 vV; varying float vT; uniform float uH;
void main() { vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vV = normalize( -mv.xyz ); vT = uv.y; gl_Position = projectionMatrix * mv; }`;
const CONE_FS = `uniform vec3 uC; uniform float uK; varying vec3 vN; varying vec3 vV; varying float vT;
void main() { float f = pow( abs( dot( vN, vV ) ), 2.2 ); float v = pow( vT, 1.6 ) * ( 0.25 + 0.75 * vT ); gl_FragColor = vec4( uC * uK * f * v, 1.0 ); }`;
const coneMats = new WeakMap();
// light shaft from (x, yTop, z) down to the floor (or o.len), opening angle o.r2 radius at the bottom
export function hazeCone(ctx, x, yTop, z, o = {}) {
  const { G, M } = ctx, len = o.len ?? yTop - 0.02, r1 = o.r1 ?? 0.05, r2 = o.r2 ?? 0.7, col = o.color || '#ffd9b0', key = col + ':' + (o.k ?? 0.05);
  let mats = coneMats.get(M); if (!mats) coneMats.set(M, mats = new Map());
  let mat = mats.get(key); if (!mat) { const c = lin(col); mat = new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(c[0], c[1], c[2]) }, uK: { value: o.k ?? 0.05 }, uH: { value: 1 } }, vertexShader: CONE_VS, fragmentShader: CONE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.userData.order = 7; mats.set(key, mat); M.owned.push(mat); const k0 = o.k ?? 0.05, ch = o.ch ?? 1;
    ctx.anim.push((dt, t, store) => { const lv = store.built?.levels; mat.uniforms.uK.value = k0 * (lv ? (ch === 0 ? lv[0] : lv[1]) : 1); }); }
  const geo = new THREE.CylinderGeometry(r1, r2, len, 20, 1, true); // uv.y: 1 at the narrow (source) end
  if (o.up) { geo.rotateX(Math.PI); G.add(mat, geo, new THREE.Matrix4().makeTranslation(x, yTop + len / 2, z)); } // o.up: source at yTop, opening upward
  else G.add(mat, geo, new THREE.Matrix4().makeTranslation(x, yTop - len / 2, z)); geo.dispose();
  return mat;
}

// ---------------------------------------------------------------- candle flames
const FLAME_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vV = normalize( -mv.xyz ); gl_Position = projectionMatrix * mv; }`;
const FLAME_FS = `uniform float uT; uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() { float ph = vUv.x * 61.0; float fl = 0.78 + 0.14 * sin( uT * 9.0 + ph ) + 0.08 * sin( uT * 23.0 + ph * 1.7 ) + 0.06 * sin( uT * 3.1 + ph * 0.3 );
  float rim = pow( abs( dot( vN, vV ) ), 0.8 ); vec3 c = mix( vec3( 1.0, 0.35, 0.06 ), vec3( 1.0, 0.82, 0.5 ), rim ) * ( 1.6 + vUv.y * 0.8 );
  gl_FragColor = vec4( c * fl * uK, 1.0 ); }`;
const flameMats = new WeakMap();
export function flameMaterial(ctx) {
  let m = flameMats.get(ctx.M); if (m) return m;
  const U = { uT: { value: 0 }, uK: { value: 3 } }; m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FLAME_VS, fragmentShader: FLAME_FS, toneMapped: false });
  flameMats.set(ctx.M, m); ctx.M.owned.push(m); ctx.anim.push((dt, t, store) => { U.uT.value = t; U.uK.value = 3 * Math.max(0.15, store.built?.levels?.[1] ?? 1); }); return m;
}
// flame at (x, y = base of the flame, z). phase: any number (each candle flickers on its own)
export function flame(ctx, x, y, z, o = {}) {
  const ph = ((o.phase ?? ctx.R()) % 1 + 1) % 1, s = o.s || 1;
  ctx.G.sphere(flameMaterial(ctx), x, y + 0.012 * s, z, 0.0065 * s, { sy: 2.4, seg: 8, uvRect: [ph, 0, ph + 0.0001, 1] });
  addLight(ctx, { p: [x, y + 0.03, z], c: lin('#ffb060').map((v) => v * (o.k ?? 0.22)), ch: o.ch ?? 1, type: 'omni', soft: 0.12, wrap: 0.2, amb: 0.5, noPool: !o.pool });
}

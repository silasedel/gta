// Shop windows that show a room (shops pass, Nov 17). Storefront lots without a live interior (only the nearest few get one) show a
// parallax "interior mapping" room behind their glazing instead of an empty shell: the towns track's room-glass shader
// (setpieces/houses/materials.js shopGlass, kinds: 0 plain, 1 shelves with goods, 2 cafe, 3 boutique racks, 4 office / bank,
// 5 diner) on a pane 0.25 m inside the facade, with the shop's own kind. It reaches 150 m (the facade-shader bays stop at 70 m), and
// it steps aside wherever a real interior is shown: every frame the engine passes the visible interiors (center, size, facing) and
// the fragments inside those boxes are discarded, so the built store and the painted room never overlap.
import * as THREE from 'three';

const N = 10;
const U = { uHideA: { value: Array.from({ length: N }, () => new THREE.Vector4(1e9, 1e9, 1, 0)) }, uHideB: { value: Array.from({ length: N }, () => new THREE.Vector2(0, 0)) } };

export function shopRoomsMaterial(M) {
  if (M.shopRooms !== undefined) return M.shopRooms;
  M.shopRooms = null; const base = M.roomGlass; if (!base || /[?&]shops=0\b/.test(globalThis.location?.search || '')) return null;
  const m = base.clone(); m.name = 'shops:rooms'; m.side = THREE.FrontSide;
  m.onBeforeCompile = (sh, r) => {
    base.onBeforeCompile(sh, r);
    sh.uniforms.uHideA = U.uHideA; sh.uniforms.uHideB = U.uHideB;
    sh.fragmentShader = sh.fragmentShader.replace('rd > 55.0 + 15.0 * rth', 'rd > 150.0 + 20.0 * rth')
      .replace('uniform float uRoomOn;', `uniform float uRoomOn; uniform vec4 uHideA[${N}]; uniform vec2 uHideB[${N}];`)
      .replace('void main() {\n  {', `void main() {
  for ( int i = 0; i < ${N}; i ++ ) { vec2 d = vRoomW.xz - uHideA[ i ].xy; float u = d.x * uHideA[ i ].z - d.y * uHideA[ i ].w, v = d.x * uHideA[ i ].w + d.y * uHideA[ i ].z; if ( abs( u ) < uHideB[ i ].x && abs( v ) < uHideB[ i ].y ) discard; }
  {`);
  };
  m.customProgramCacheKey = () => 'shops:rooms|hide' + N;
  M.shopRooms = m; return m;
}

// room shader kind for a storefront kind
export function roomKind(kind) {
  const k = String(kind || '');
  if (/cloth|boutique|fashion|shoe|bag|jewel|department/.test(k)) return 3;
  if (/cafe|coffee|bakery|pastry|ice_cream|bar|pub/.test(k)) return 2;
  if (/restaurant|fast_food|diner|food/.test(k)) return 5;
  if (/bank|office|insurance|estate|travel|lawyer|clinic|dentist|salon|hairdresser|beauty/.test(k)) return 4;
  if (/convenience|pharmacy|chemist|liquor|alcohol|supermarket|hardware|electronics|variety|deli|greengrocer|kiosk|mobile|books|gift|toys/.test(k)) return 1;
  return 1;
}

// stores: iterable of interior records { center, W, D, facing, built: { visible } } (V2 and legacy lists)
export function updateShopRoomHide(lists) {
  let n = 0; const A = U.uHideA.value, B = U.uHideB.value;
  for (const list of lists) { if (!list) continue; for (const s of list) { if (n >= N) break; if (!s.built || !s.built.visible || !s.center) continue;
    A[n].set(s.center.x, s.center.z, Math.cos(s.facing || 0), Math.sin(s.facing || 0)); B[n].set((s.W || 6) / 2 + 0.35, (s.D || 8) / 2 + 0.9); n++; } }
  for (let i = n; i < N; i++) { A[i].set(1e9, 1e9, 1, 0); B[i].set(0, 0); }
}

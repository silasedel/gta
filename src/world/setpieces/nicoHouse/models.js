// Key Largo library models (track: keys): the user's converted models (public/assets/models/docks|keys/*.glb, built by
// tools/v2/keys/build_models.sh) loaded once, split into named pieces, and placed through per-piece instancing.
//   const lib = await loadKeysModels(THREE)                 lib.piece('bins', 'trashcan_blue') -> [{ geometry, material }]
//   const I = lib.instancer(name)                            I.add(model, piece, matrix4, { tint: [r,g,b] })   I.build(parent, opts)
// Pieces are re-centered: x / z on their own footprint center, y kept (deck models: walking surface at 0, props: base at 0).
// Three.js axes: the converter exported Y up; a piece's long axis is whatever the source had (see tools/v2/keys/README in data).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
const FILES = {
  pier_kit: 'assets/models/docks/pier_kit.glb', mossy_pier: 'assets/models/docks/mossy_pier.glb', clean_pier: 'assets/models/docks/clean_pier.glb',
  loose_platforms: 'assets/models/docks/loose_platforms.glb', boathouse: 'assets/models/docks/boathouse.glb',
  rolloff: 'assets/models/keys/rolloff.glb', rocks: 'assets/models/keys/rocks.glb', bins: 'assets/models/keys/bins.glb', fence_rustic: 'assets/models/keys/fence_rustic.glb',
  rowboat: 'assets/models/keys/rowboat.glb', skiff: 'assets/models/keys/skiff.glb', lifebuoy: 'assets/models/keys/lifebuoy.glb',
};
let shared = null;

export function loadKeysModels(THREE, which = Object.keys(FILES)) {
  shared ||= { THREE, scenes: new Map(), pieces: new Map() };
  const S = shared, gl = new GLTFLoader();
  const norm = (n) => String(n).toLowerCase().replace(/\.\d+$/, '').replace(/[^a-z0-9_]+/g, '_');
  const loadOne = (k) => {
    if (S.scenes.has(k)) return S.scenes.get(k);
    const p = gl.loadAsync(BASE + FILES[k]).then((g) => {
      g.scene.updateMatrixWorld(true);
      const byPiece = new Map();
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        // a glTF primitive per material arrives as a child mesh of the node: group by the node name
        const node = o.parent && !o.parent.isScene && o.name.startsWith(o.parent.name) ? o.parent : o, name = norm(node.name || o.name);
        const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
        for (const a of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(a)) geo.deleteAttribute(a);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        let e = byPiece.get(name); if (!e) byPiece.set(name, (e = new Map()));
        const m = o.material; let l = e.get(m); if (!l) e.set(m, (l = [])); l.push(geo.index ? geo : geo);
      });
      for (const [name, mm] of byPiece) {
        const parts = [];
        for (const [m, gs] of mm) { let g = gs.length > 1 ? mergeGeometries(gs.map((q) => (q.index ? q : q)), false) || gs[0] : gs[0]; parts.push({ geometry: g, material: tune(m, k) }); }
        // re-center x / z on the piece's own footprint
        const bb = new THREE.Box3(); for (const p of parts) { p.geometry.computeBoundingBox(); bb.union(p.geometry.boundingBox); }
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        for (const p of parts) { p.geometry.translate(-cx, 0, -cz); p.geometry.computeBoundingBox(); p.geometry.computeBoundingSphere(); }
        const box = new THREE.Box3(); for (const p of parts) box.union(p.geometry.boundingBox);
        S.pieces.set(k + '/' + name, { parts, box, src: [cx, cz] });
      }
      return true;
    }).catch((e) => { console.warn('[keys models] missing', k, e?.message); return false; });
    S.scenes.set(k, p); return p;
  };
  // library tuning so the models sit in the scene's look: no metal wood, wood a touch lighter and less saturated (sun-bleached)
  function tune(m, k) {
    if (m.userData.keysTuned) return m; m.userData.keysTuned = true;
    m.metalness = 0; if (m.metalnessMap) m.metalnessMap = null;
    if (m.map) { m.map.anisotropy = 8; }
    if (/pier|dock|planks|poles|section/i.test(k + m.name)) { m.color.setRGB(1.55, 1.48, 1.38); m.roughness = 1; }   // the kit's albedo is very dark (wet look): dry, sun-bleached lumber
    if (k === 'mossy_pier' || k === 'clean_pier') m.color.setRGB(1.12, 1.1, 1.05);
    if (k === 'rocks') { m.color.setRGB(1.75, 1.72, 1.64); m.roughness = 1;   // mossy brown boulders -> pale Keys limestone / coral rock:
      m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  { float l = dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) ); diffuseColor.rgb = mix( vec3( l ) * vec3( 1.0, 0.98, 0.93 ), diffuseColor.rgb, 0.22 ); }'); };   // the scan's moss and brown are taken out (78% desaturated)
      m.customProgramCacheKey = () => 'keys:limestone'; }
    if (k === 'rolloff') { m.roughness = Math.max(0.55, m.roughness); m.color.setRGB(2.9, 1.0, 0.8); }   // dark rust-brown scan -> the faded red roll-off of the mock-up
    if (m.transparent && m.opacity >= 0.99) { m.transparent = false; m.alphaTest = 0.5; }
    m.needsUpdate = true; return m;
  }
  const ready = Promise.all(which.map(loadOne));
  const lib = {
    ready,
    names: (k) => [...S.pieces.keys()].filter((n) => n.startsWith(k + '/')).map((n) => n.slice(k.length + 1)),
    piece: (k, name) => S.pieces.get(k + '/' + name) || null,
    // pile / leg feet of a dock piece: vertices within 0.35 m of its lowest point, clustered (x, z, radius, bottom y)
    legs(k, name, opts) {
      const p = S.pieces.get(k + '/' + name); if (!p) return []; if (p.legs && !opts) return p.legs;
      const lo = p.box.min.y, pts = [];
      for (const q of p.parts) { const a = q.geometry.attributes.position; for (let i = 0; i < a.count; i++) if (a.getY(i) < lo + (opts?.band ?? 0.35)) pts.push([a.getX(i), a.getZ(i), a.getY(i)]); }
      const cl = [];
      for (const [x, z, y] of pts) { let c = cl.find((c) => Math.hypot(c.sx / c.n - x, c.sz / c.n - z) < 0.35); if (!c) cl.push((c = { sx: 0, sz: 0, n: 0, r: 0, y: 1e9, pts: [] })); c.sx += x; c.sz += z; c.n++; c.y = Math.min(c.y, y); c.pts.push([x, z]); }
      p.legs = cl.map((c) => { const x = c.sx / c.n, z = c.sz / c.n; let r = 0.06; for (const [a, b] of c.pts) r = Math.max(r, Math.hypot(a - x, b - z)); return { x, z, r: Math.min(0.25, r), y: c.y }; });
      return p.legs;
    },
    // per-piece instancing: one InstancedMesh per piece material, per-instance tint (instanceColor)
    instancer(tag = 'keys') {
      const lists = new Map();
      return {
        add(k, name, m4, o = {}) { const p = S.pieces.get(k + '/' + name); if (!p) return false; let l = lists.get(p); if (!l) lists.set(p, (l = [])); l.push({ m4: m4.clone(), tint: o.tint || null }); return true; },
        count() { let n = 0; for (const l of lists.values()) n += l.length; return n; },
        build(parent, o = {}) {
          const out = [], c = new THREE.Color();
          for (const [p, l] of lists) for (const part of p.parts) {
            const im = new THREE.InstancedMesh(part.geometry, part.material, l.length); im.name = tag + ':' + (part.material.name || 'mat');
            l.forEach((it, i) => { im.setMatrixAt(i, it.m4); c.setRGB(...(it.tint || [1, 1, 1])); im.setColorAt(i, c); });
            im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
            im.castShadow = o.cast ?? true; im.receiveShadow = true; im.computeBoundingSphere(); im.computeBoundingBox?.();
            parent.add(im); out.push(im);
          }
          return out;
        },
      };
    },
  };
  return lib;
}
